use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};

use chrono::{DateTime, Utc};
use notify::{RecursiveMode, Watcher};
use once_cell::sync::Lazy;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

static WATCH_STATE: Lazy<Mutex<HashMap<String, WatchState>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static PULL_STATE: Lazy<Mutex<HashMap<String, PullState>>> = Lazy::new(|| Mutex::new(HashMap::new()));

struct WatchState {
  _watcher: notify::RecommendedWatcher,
  stop_tx: mpsc::Sender<()>,
}

struct PullState {
  stop_tx: mpsc::Sender<()>,
}

fn sync_key(vault_path: &str, project_folder_id: &str) -> String {
  format!("{}|{}", vault_path, project_folder_id)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncMappingV1 {
  pub version: u32,
  pub vault_path: String,
  pub project_folder_id: String,
  pub created_at: String,
  pub updated_at: String,
  #[serde(default)]
  pub last_pull_at: String,
  #[serde(default)]
  pub last_rag_export_at: String,
  /// Relative folder path (posix-style) -> supabase folder UUID.
  pub folders: HashMap<String, String>,
  /// Relative file path (posix-style) -> remote mapping.
  pub files: HashMap<String, FileMappingV1>,
  /// Relative resource path (posix-style) -> remote mapping.
  #[serde(default)]
  pub resources: HashMap<String, ResourceMappingV1>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMappingV1 {
  pub file_id: String,
  pub folder_id: String,
  pub kind: String,
  pub local_hash: String,
  pub remote_updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResourceMappingV1 {
  pub resource_id: String,
  pub local_hash: String,
  pub remote_updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SupabaseAuth {
  pub supabase_url: String,
  pub supabase_anon_key: String,
  pub access_token: String,
  pub refresh_token: Option<String>,
  pub owner_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SyncSummary {
  pub folders_created: u32,
  pub folders_reused: u32,
  pub files_created: u32,
  pub files_updated: u32,
  pub files_deleted: u32,
  pub files_skipped: u32,
  pub resources_deleted: u32,
  pub errors: Vec<String>,
}

fn now_iso() -> String {
  DateTime::<Utc>::from(Utc::now()).to_rfc3339()
}

fn nexusmap_dir(vault_path: &str) -> PathBuf {
  Path::new(vault_path).join(".nexusmap")
}

fn mapping_path(vault_path: &str) -> PathBuf {
  nexusmap_dir(vault_path).join("sync.json")
}

fn events_path(vault_path: &str) -> PathBuf {
  nexusmap_dir(vault_path).join("events.jsonl")
}

fn trash_dir(vault_path: &str) -> PathBuf {
  nexusmap_dir(vault_path).join("trash")
}

fn archive_file_to_trash(vault_path: &str, rel_path: &str) -> Result<Option<PathBuf>, String> {
  let src = Path::new(vault_path).join(rel_path);
  if !src.exists() {
    return Ok(None);
  }
  let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
  if !meta.is_file() {
    return Ok(None);
  }

  let ts = Utc::now().format("%Y-%m-%dT%H%M%SZ").to_string();
  let dst = trash_dir(vault_path).join(&ts).join(rel_path);
  if let Some(parent) = dst.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  fs::copy(&src, &dst).map_err(|e| e.to_string())?;
  fs::remove_file(&src).map_err(|e| e.to_string())?;
  Ok(Some(dst))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncEvent {
  pub ts: String,
  pub kind: String,
  pub path: String,
  pub detail: String,
}

fn append_event(vault_path: &str, ev: &SyncEvent) -> Result<(), String> {
  fs::create_dir_all(nexusmap_dir(vault_path)).map_err(|e| e.to_string())?;
  let p = events_path(vault_path);
  let mut f = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&p)
    .map_err(|e| e.to_string())?;
  let line = serde_json::to_string(ev).map_err(|e| e.to_string())?;
  writeln!(f, "{}", line).map_err(|e| e.to_string())
}

fn read_events(vault_path: &str, limit: usize) -> Result<Vec<SyncEvent>, String> {
  let p = events_path(vault_path);
  if !p.exists() {
    return Ok(vec![]);
  }
  let text = fs::read_to_string(&p).map_err(|e| e.to_string())?;
  let mut out: Vec<SyncEvent> = Vec::new();
  for line in text.lines().rev().take(limit) {
    if let Ok(ev) = serde_json::from_str::<SyncEvent>(line) {
      out.push(ev);
    }
  }
  out.reverse();
  Ok(out)
}

fn read_mapping(vault_path: &str) -> Result<Option<SyncMappingV1>, String> {
  let p = mapping_path(vault_path);
  if !p.exists() {
    return Ok(None);
  }
  let text = fs::read_to_string(&p).map_err(|e| e.to_string())?;
  let m: SyncMappingV1 = serde_json::from_str(&text).map_err(|e| e.to_string())?;
  Ok(Some(m))
}

fn write_mapping(vault_path: &str, mapping: &SyncMappingV1) -> Result<(), String> {
  let dir = nexusmap_dir(vault_path);
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let p = mapping_path(vault_path);
  let text = serde_json::to_string_pretty(mapping).map_err(|e| e.to_string())?;
  fs::write(&p, text).map_err(|e| e.to_string())
}

fn sha256_hex(bytes: &[u8]) -> String {
  let mut hasher = Sha256::new();
  hasher.update(bytes);
  let out = hasher.finalize();
  format!("{:x}", out)
}

fn to_rel_posix(root: &Path, p: &Path) -> Option<String> {
  let rel = p.strip_prefix(root).ok()?;
  let s = rel
    .components()
    .map(|c| c.as_os_str().to_string_lossy().to_string())
    .collect::<Vec<_>>()
    .join("/");
  Some(s)
}

fn detect_kind(markdown: &str) -> String {
  // Default: note (portable).
  // If a nexus-doc header exists, honor its `kind` field.
  if let Some(start) = markdown.find("```nexus-doc") {
    let after_start = &markdown[start + "```nexus-doc".len()..];
    if let Some(end) = after_start.find("\n```") {
      let json_text = after_start[..end].trim();
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_text) {
        if let Some(kind) = v.get("kind").and_then(|k| k.as_str()) {
          return kind.to_string();
        }
      }
    }
  }

  "note".to_string()
}

fn supabase_headers(auth: &SupabaseAuth) -> Result<HeaderMap, String> {
  let mut h = HeaderMap::new();
  h.insert("apikey", HeaderValue::from_str(&auth.supabase_anon_key).map_err(|e| e.to_string())?);
  h.insert(
    "Authorization",
    HeaderValue::from_str(&format!("Bearer {}", auth.access_token)).map_err(|e| e.to_string())?,
  );
  Ok(h)
}

#[derive(Debug, Deserialize)]
struct RefreshTokenResponse {
  access_token: String,
  refresh_token: Option<String>,
}

async fn refresh_access_token(client: &reqwest::Client, auth: &mut SupabaseAuth) -> Result<(), String> {
  let refresh = auth
    .refresh_token
    .clone()
    .ok_or_else(|| "missing refresh_token (cannot refresh)".to_string())?;

  let url = format!("{}/auth/v1/token?grant_type=refresh_token", auth.supabase_url.trim_end_matches('/'));
  let res = client
    .post(url)
    .header("apikey", auth.supabase_anon_key.clone())
    .header("content-type", "application/json")
    .json(&serde_json::json!({ "refresh_token": refresh }))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !res.status().is_success() {
    return Err(format!("token refresh failed: HTTP {}", res.status()));
  }
  let json: RefreshTokenResponse = res.json().await.map_err(|e| e.to_string())?;
  auth.access_token = json.access_token;
  if let Some(rt) = json.refresh_token {
    auth.refresh_token = Some(rt);
  }
  Ok(())
}

async fn send_with_refresh<T>(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  make_req: impl Fn() -> reqwest::RequestBuilder,
  parse: impl Fn(reqwest::Response) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, String>> + Send>>,
) -> Result<T, String> {
  let res = make_req()
    .headers(supabase_headers(auth)?)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if res.status() == reqwest::StatusCode::UNAUTHORIZED {
    refresh_access_token(client, auth).await?;
    let res2 = make_req()
      .headers(supabase_headers(auth)?)
      .send()
      .await
      .map_err(|e| e.to_string())?;
    return parse(res2).await;
  }

  parse(res).await
}

fn rest_base(auth: &SupabaseAuth) -> String {
  format!("{}/rest/v1", auth.supabase_url.trim_end_matches('/'))
}

#[derive(Debug, Deserialize)]
struct FolderRow {
  id: String,
}

#[derive(Debug, Deserialize)]
struct FileRow {
  id: String,
  updated_at: Option<String>,
}

async fn find_folder_id(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  parent_id: Option<&str>,
  name: &str,
) -> Result<Option<String>, String> {
  let mut url = reqwest::Url::parse(&format!("{}/folders", rest_base(auth))).map_err(|e| e.to_string())?;
  {
    let mut q = url.query_pairs_mut();
    q.append_pair("select", "id");
    q.append_pair("name", &format!("eq.{}", name));
    match parent_id {
      Some(pid) => q.append_pair("parent_id", &format!("eq.{}", pid)),
      None => q.append_pair("parent_id", "is.null"),
    };
    q.append_pair("limit", "1");
  }

  send_with_refresh(
    client,
    auth,
    || client.get(url.clone()),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("folder lookup failed: HTTP {}", res.status()));
        }
        let rows: Vec<FolderRow> = res.json().await.map_err(|e| e.to_string())?;
        Ok(rows.into_iter().next().map(|r| r.id))
      })
    },
  )
  .await
}

async fn create_folder(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  parent_id: Option<&str>,
  name: &str,
) -> Result<String, String> {
  let url = format!("{}/folders", rest_base(auth));
  let body = serde_json::json!({
    "name": name,
    "owner_id": auth.owner_id,
    "parent_id": parent_id
  });

  send_with_refresh(
    client,
    auth,
    || client.post(url.clone()).header("Prefer", "return=representation").json(&body),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("folder create failed: HTTP {}", res.status()));
        }
        let rows: Vec<FolderRow> = res.json().await.map_err(|e| e.to_string())?;
        rows
          .into_iter()
          .next()
          .map(|r| r.id)
          .ok_or_else(|| "folder create: empty response".to_string())
      })
    },
  )
  .await
}

async fn ensure_folder_path(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  mapping: &mut SyncMappingV1,
  summary: &mut SyncSummary,
  rel_folder_path: &str,
) -> Result<String, String> {
  if rel_folder_path.trim().is_empty() {
    return Ok(mapping.project_folder_id.clone());
  }

  let mut parent_id = mapping.project_folder_id.clone();
  let mut current_rel = String::new();

  for seg in rel_folder_path.split('/').filter(|s| !s.is_empty()) {
    let next_rel = if current_rel.is_empty() {
      seg.to_string()
    } else {
      format!("{}/{}", current_rel, seg)
    };

    if let Some(id) = mapping.folders.get(&next_rel) {
      parent_id = id.clone();
      current_rel = next_rel;
      continue;
    }

    if let Some(found) = find_folder_id(client, auth, Some(&parent_id), seg).await? {
      mapping.folders.insert(next_rel.clone(), found.clone());
      summary.folders_reused += 1;
      parent_id = found;
      current_rel = next_rel;
      continue;
    }

    let created = create_folder(client, auth, Some(&parent_id), seg).await?;
    mapping.folders.insert(next_rel.clone(), created.clone());
    summary.folders_created += 1;
    parent_id = created;
    current_rel = next_rel;
  }

  Ok(parent_id)
}

async fn find_file_id(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  folder_id: &str,
  name: &str,
) -> Result<Option<String>, String> {
  let mut url = reqwest::Url::parse(&format!("{}/files", rest_base(auth))).map_err(|e| e.to_string())?;
  {
    let mut q = url.query_pairs_mut();
    q.append_pair("select", "id");
    q.append_pair("folder_id", &format!("eq.{}", folder_id));
    q.append_pair("name", &format!("eq.{}", name));
    q.append_pair("limit", "1");
  }

  send_with_refresh(
    client,
    auth,
    || client.get(url.clone()),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("file lookup failed: HTTP {}", res.status()));
        }
        let rows: Vec<FileRow> = res.json().await.map_err(|e| e.to_string())?;
        Ok(rows.into_iter().next().map(|r| r.id))
      })
    },
  )
  .await
}

async fn create_file(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  folder_id: &str,
  name: &str,
  kind: &str,
  content: &str,
  updated_at: &str,
) -> Result<FileRow, String> {
  let url = format!("{}/files", rest_base(auth));
  let body = serde_json::json!({
    "name": name,
    "folder_id": folder_id,
    "owner_id": auth.owner_id,
    "kind": kind,
    "content": content,
    "updated_at": updated_at
  });

  send_with_refresh(
    client,
    auth,
    || client.post(url.clone()).header("Prefer", "return=representation").json(&body),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("file create failed: HTTP {}", res.status()));
        }
        let rows: Vec<FileRow> = res.json().await.map_err(|e| e.to_string())?;
        rows
          .into_iter()
          .next()
          .ok_or_else(|| "file create: empty response".to_string())
      })
    },
  )
  .await
}

async fn update_file(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  file_id: &str,
  kind: &str,
  content: &str,
  updated_at: &str,
) -> Result<FileRow, String> {
  let mut url = reqwest::Url::parse(&format!("{}/files", rest_base(auth))).map_err(|e| e.to_string())?;
  url
    .query_pairs_mut()
    .append_pair("id", &format!("eq.{}", file_id));

  let body = serde_json::json!({
    "kind": kind,
    "content": content,
    "updated_at": updated_at
  });

  send_with_refresh(
    client,
    auth,
    || client.patch(url.clone()).header("Prefer", "return=representation").json(&body),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("file update failed: HTTP {}", res.status()));
        }
        let rows: Vec<FileRow> = res.json().await.map_err(|e| e.to_string())?;
        rows
          .into_iter()
          .next()
          .ok_or_else(|| "file update: empty response".to_string())
      })
    },
  )
  .await
}

async fn delete_file(client: &reqwest::Client, auth: &mut SupabaseAuth, file_id: &str) -> Result<(), String> {
  let mut url = reqwest::Url::parse(&format!("{}/files", rest_base(auth))).map_err(|e| e.to_string())?;
  url
    .query_pairs_mut()
    .append_pair("id", &format!("eq.{}", file_id));

  send_with_refresh(
    client,
    auth,
    || client.delete(url.clone()),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("file delete failed: HTTP {}", res.status()));
        }
        Ok(())
      })
    },
  )
  .await
}

#[derive(Debug, Deserialize)]
struct RemoteFileBackupRow {
  id: String,
  name: String,
  content: Option<String>,
}

async fn fetch_file_backup(client: &reqwest::Client, auth: &mut SupabaseAuth, file_id: &str) -> Result<Option<RemoteFileBackupRow>, String> {
  let mut url = reqwest::Url::parse(&format!("{}/files", rest_base(auth))).map_err(|e| e.to_string())?;
  {
    let mut q = url.query_pairs_mut();
    q.append_pair("select", "id,name,content");
    q.append_pair("id", &format!("eq.{}", file_id));
    q.append_pair("limit", "1");
  }
  send_with_refresh(
    client,
    auth,
    || client.get(url.clone()),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("file backup fetch failed: HTTP {}", res.status()));
        }
        let rows: Vec<RemoteFileBackupRow> = res.json().await.map_err(|e| e.to_string())?;
        Ok(rows.into_iter().next())
      })
    },
  )
  .await
}

#[tauri::command]
pub async fn sync_init(vault_path: String, project_folder_id: String) -> Result<SyncMappingV1, String> {
  if vault_path.trim().is_empty() {
    return Err("vault_path is required".to_string());
  }
  if project_folder_id.trim().is_empty() {
    return Err("project_folder_id is required".to_string());
  }

  if let Some(existing) = read_mapping(&vault_path)? {
    if existing.project_folder_id != project_folder_id {
      return Err("This vault is already linked to a different NexusMap project. Remove .nexusmap/sync.json to relink.".to_string());
    }
    return Ok(existing);
  }

  let now = now_iso();
  let mut folders = HashMap::new();
  folders.insert("".to_string(), project_folder_id.clone());
  let mapping = SyncMappingV1 {
    version: 1,
    vault_path: vault_path.clone(),
    project_folder_id,
    created_at: now.clone(),
    updated_at: now,
    last_pull_at: String::new(),
    last_rag_export_at: String::new(),
    folders,
    files: HashMap::new(),
    resources: HashMap::new(),
  };

  write_mapping(&vault_path, &mapping)?;
  Ok(mapping)
}

#[tauri::command]
pub async fn sync_initial_import(vault_path: String, project_folder_id: String, auth: SupabaseAuth) -> Result<SyncSummary, String> {
  let root = Path::new(&vault_path);
  if !root.exists() {
    return Err("vault_path does not exist".to_string());
  }

  let mut auth = auth;
  let mut mapping = match read_mapping(&vault_path)? {
    Some(m) => m,
    None => sync_init(vault_path.clone(), project_folder_id.clone()).await?,
  };
  if mapping.project_folder_id != project_folder_id {
    return Err("mapping project_folder_id mismatch".to_string());
  }

  let client = reqwest::Client::new();
  let mut summary = SyncSummary::default();
  let updated_at = now_iso();

  // Ensure root mapping exists.
  mapping.folders.insert("".to_string(), project_folder_id.clone());

  for entry in WalkDir::new(root)
    .follow_links(false)
    .into_iter()
    .filter_map(Result::ok)
  {
    let p = entry.path();
    if p == root {
      continue;
    }

    // Ignore internal folder
    if p.components().any(|c| c.as_os_str() == ".nexusmap") {
      continue;
    }

    let rel = match to_rel_posix(root, p) {
      Some(r) => r,
      None => continue,
    };
    if rel == "resources" || rel.starts_with("resources/") {
      continue;
    }
    if rel == "rag" || rel.starts_with("rag/") {
      continue;
    }

    if entry.file_type().is_dir() {
      let _ = ensure_folder_path(&client, &mut auth, &mut mapping, &mut summary, &rel).await?;
      continue;
    }

    // Only markdown files
    if p.extension().and_then(|e| e.to_str()).unwrap_or("") != "md" {
      continue;
    }

    let bytes = fs::read(p).map_err(|e| e.to_string())?;
    let local_hash = sha256_hex(&bytes);
    let content = String::from_utf8_lossy(&bytes).to_string();
    let kind = detect_kind(&content);

    // Determine remote folder id.
    let parent_rel = Path::new(&rel)
      .parent()
      .and_then(|p| p.to_str())
      .unwrap_or("")
      .to_string();
    let parent_rel = if parent_rel == "." { "".to_string() } else { parent_rel };
    let folder_id = ensure_folder_path(&client, &mut auth, &mut mapping, &mut summary, &parent_rel).await?;

    if let Some(prev) = mapping.files.get(&rel) {
      if prev.local_hash == local_hash {
        summary.files_skipped += 1;
        continue;
      }
      let row = update_file(&client, &mut auth, &prev.file_id, &kind, &content, &updated_at).await?;
      mapping.files.insert(
        rel.clone(),
        FileMappingV1 {
          file_id: prev.file_id.clone(),
          folder_id: folder_id.clone(),
          kind,
          local_hash,
          remote_updated_at: row.updated_at.unwrap_or_else(|| updated_at.clone()),
        },
      );
      summary.files_updated += 1;
      continue;
    }

    // Try reuse an existing remote row with same name in the same folder.
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("Untitled.md");
    let file_id = match find_file_id(&client, &mut auth, &folder_id, name).await? {
      Some(id) => id,
      None => {
        let row = create_file(&client, &mut auth, &folder_id, name, &kind, &content, &updated_at).await?;
        summary.files_created += 1;
        mapping.files.insert(
          rel.clone(),
          FileMappingV1 {
            file_id: row.id.clone(),
            folder_id: folder_id.clone(),
            kind,
            local_hash,
            remote_updated_at: row.updated_at.unwrap_or_else(|| updated_at.clone()),
          },
        );
        continue;
      }
    };

    let row = update_file(&client, &mut auth, &file_id, &kind, &content, &updated_at).await?;
    summary.files_updated += 1;
    mapping.files.insert(
      rel.clone(),
      FileMappingV1 {
        file_id: file_id.clone(),
        folder_id: folder_id.clone(),
        kind,
        local_hash,
        remote_updated_at: row.updated_at.unwrap_or_else(|| updated_at.clone()),
      },
    );
  }

  mapping.updated_at = now_iso();
  write_mapping(&vault_path, &mapping)?;
  Ok(summary)
}

async fn sync_one_path(vault_path: &str, project_folder_id: &str, auth: &SupabaseAuth, abs_path: &Path) -> Result<(), String> {
  let root = Path::new(vault_path);
  if !abs_path.starts_with(root) {
    return Ok(());
  }
  if abs_path.components().any(|c| c.as_os_str() == ".nexusmap") {
    return Ok(());
  }

  let rel = match to_rel_posix(root, abs_path) {
    Some(r) => r,
    None => return Ok(()),
  };
  // `project_resources` are pulled into `resources/…` locally. Do not push these back as normal files.
  if rel == "resources" || rel.starts_with("resources/") {
    return Ok(());
  }
  if rel == "rag" || rel.starts_with("rag/") {
    return Ok(());
  }

  let client = reqwest::Client::new();
  let mut summary = SyncSummary::default();
  let updated_at = now_iso();

  let mut auth = auth.clone();
  let mut mapping = match read_mapping(vault_path)? {
    Some(m) => m,
    None => sync_init(vault_path.to_string(), project_folder_id.to_string()).await?,
  };
  if mapping.project_folder_id != project_folder_id {
    return Err("mapping project_folder_id mismatch".to_string());
  }
  mapping.folders.insert("".to_string(), project_folder_id.to_string());

  if abs_path.exists() && abs_path.is_dir() {
    let _ = ensure_folder_path(&client, &mut auth, &mut mapping, &mut summary, &rel).await?;
    mapping.updated_at = now_iso();
    write_mapping(vault_path, &mapping)?;
    let _ = append_event(
      vault_path,
      &SyncEvent {
        ts: now_iso(),
        kind: "push".to_string(),
        path: rel.clone(),
        detail: "Ensured remote folder".to_string(),
      },
    );
    return Ok(());
  }

  // Deleted file
  if !abs_path.exists() {
    if let Some(prev) = mapping.files.remove(&rel) {
      let ts = Utc::now().format("%Y-%m-%dT%H%M%SZ").to_string();
      if let Ok(Some(bk)) = fetch_file_backup(&client, &mut auth, &prev.file_id).await {
        let trash_path = trash_dir(vault_path).join(&ts).join(&rel);
        if let Some(parent) = trash_path.parent() {
          let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&trash_path, bk.content.unwrap_or_default());
      }
      let _ = append_event(
        vault_path,
        &SyncEvent {
          ts: now_iso(),
          kind: "delete".to_string(),
          path: rel.clone(),
          detail: format!("Deleted remote file_id={}", prev.file_id),
        },
      );
      let _ = delete_file(&client, &mut auth, &prev.file_id).await;
      mapping.updated_at = now_iso();
      write_mapping(vault_path, &mapping)?;
    }
    return Ok(());
  }

  // Only markdown files
  if abs_path.extension().and_then(|e| e.to_str()).unwrap_or("") != "md" {
    return Ok(());
  }

  let bytes = fs::read(abs_path).map_err(|e| e.to_string())?;
  let local_hash = sha256_hex(&bytes);
  let content = String::from_utf8_lossy(&bytes).to_string();
  let kind = detect_kind(&content);

  let parent_rel = Path::new(&rel)
    .parent()
    .and_then(|p| p.to_str())
    .unwrap_or("")
    .to_string();
  let parent_rel = if parent_rel == "." { "".to_string() } else { parent_rel };
  let folder_id = ensure_folder_path(&client, &mut auth, &mut mapping, &mut summary, &parent_rel).await?;

  if let Some(prev) = mapping.files.get(&rel).cloned() {
    if prev.local_hash == local_hash {
      return Ok(());
    }
    let row = update_file(&client, &mut auth, &prev.file_id, &kind, &content, &updated_at).await?;
    mapping.files.insert(
      rel.clone(),
      FileMappingV1 {
        file_id: prev.file_id.clone(),
        folder_id,
        kind,
        local_hash,
        remote_updated_at: row.updated_at.unwrap_or_else(|| updated_at.clone()),
      },
    );
    mapping.updated_at = now_iso();
    write_mapping(vault_path, &mapping)?;
    let _ = append_event(
      vault_path,
      &SyncEvent {
        ts: now_iso(),
        kind: "push".to_string(),
        path: rel.clone(),
        detail: format!("Updated remote file_id={}", prev.file_id),
      },
    );
    return Ok(());
  }

  // Insert or reuse remote file
  let name = abs_path.file_name().and_then(|n| n.to_str()).unwrap_or("Untitled.md");
  let file_id = match find_file_id(&client, &mut auth, &folder_id, name).await? {
    Some(id) => id,
    None => {
      let row = create_file(&client, &mut auth, &folder_id, name, &kind, &content, &updated_at).await?;
      mapping.files.insert(
        rel.clone(),
        FileMappingV1 {
          file_id: row.id.clone(),
          folder_id,
          kind,
          local_hash,
          remote_updated_at: row.updated_at.unwrap_or_else(|| updated_at.clone()),
        },
      );
      mapping.updated_at = now_iso();
      write_mapping(vault_path, &mapping)?;
      return Ok(());
    }
  };

  let row = update_file(&client, &mut auth, &file_id, &kind, &content, &updated_at).await?;
  mapping.files.insert(
    rel.clone(),
    FileMappingV1 {
      file_id: file_id.clone(),
      folder_id,
      kind,
      local_hash,
      remote_updated_at: row.updated_at.unwrap_or_else(|| updated_at.clone()),
    },
  );
  mapping.updated_at = now_iso();
  write_mapping(vault_path, &mapping)?;
  let _ = append_event(
    vault_path,
    &SyncEvent {
      ts: now_iso(),
      kind: "push".to_string(),
      path: rel.clone(),
      detail: format!("Upserted remote file_id={}", file_id),
    },
  );
  Ok(())
}

#[tauri::command]
pub async fn sync_watch_start(vault_path: String, project_folder_id: String, auth: SupabaseAuth) -> Result<(), String> {
  let mut guard = WATCH_STATE.lock().map_err(|_| "watch state lock poisoned".to_string())?;
  let key = sync_key(&vault_path, &project_folder_id);
  if guard.contains_key(&key) {
    return Err("sync watcher already running for this project".to_string());
  }

  let (evt_tx, evt_rx) = mpsc::channel::<Result<notify::Event, notify::Error>>();
  let (stop_tx, stop_rx) = mpsc::channel::<()>();

  let mut watcher = notify::recommended_watcher(move |res| {
    let _ = evt_tx.send(res);
  })
  .map_err(|e| e.to_string())?;

  watcher
    .watch(Path::new(&vault_path), RecursiveMode::Recursive)
    .map_err(|e| e.to_string())?;

  let vault_path2 = vault_path.clone();
  let project_folder_id2 = project_folder_id.clone();
  let auth2 = auth.clone();

  std::thread::spawn(move || {
    loop {
      if stop_rx.try_recv().is_ok() {
        break;
      }

      match evt_rx.recv_timeout(std::time::Duration::from_millis(400)) {
        Ok(Ok(event)) => {
          for p in event.paths {
            let _ = tauri::async_runtime::block_on(sync_one_path(
              &vault_path2,
              &project_folder_id2,
              &auth2,
              &p,
            ));
          }
        }
        Ok(Err(_e)) => {
          // ignore watcher errors for now
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {}
        Err(mpsc::RecvTimeoutError::Disconnected) => break,
      }
    }
  });

  guard.insert(key, WatchState { _watcher: watcher, stop_tx });
  Ok(())
}

#[tauri::command]
pub async fn sync_watch_stop() -> Result<(), String> {
  let mut guard = WATCH_STATE.lock().map_err(|_| "watch state lock poisoned".to_string())?;
  for (_, st) in guard.drain() {
    let _ = st.stop_tx.send(());
  }
  Ok(())
}

#[derive(Debug, Deserialize, Clone)]
struct FolderNode {
  id: String,
  parent_id: Option<String>,
  name: String,
}

#[derive(Debug, Deserialize, Clone)]
struct RemoteFileRow {
  id: String,
  name: String,
  folder_id: Option<String>,
  content: Option<String>,
  updated_at: Option<String>,
  kind: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct RemoteIdRow {
  id: String,
}

#[derive(Debug, Deserialize, Clone)]
struct RemoteResourceRow {
  id: String,
  name: String,
  markdown: String,
  updated_at: Option<String>,
  source: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
struct RagProjectRow {
  owner_id: String,
  project_folder_id: String,
  public_id: String,
  updated_at: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
struct KgEntityRow {
  owner_id: String,
  id: String,
  project_folder_id: Option<String>,
  entity_type: String,
  file_id: Option<String>,
  data: serde_json::Value,
  updated_at: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
struct KgEdgeRow {
  owner_id: String,
  id: String,
  project_folder_id: Option<String>,
  edge_type: String,
  src: String,
  dst: String,
  data: serde_json::Value,
  updated_at: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Serialize)]
struct RagChunkRowLite {
  owner_id: String,
  id: String,
  project_folder_id: Option<String>,
  file_id: Option<String>,
  resource_id: Option<String>,
  file_kind: Option<String>,
  anchor: Option<String>,
  text: String,
  metadata: Option<serde_json::Value>,
  updated_at: Option<String>,
}

async fn fetch_all_folders(client: &reqwest::Client, auth: &mut SupabaseAuth) -> Result<Vec<FolderNode>, String> {
  let mut url = reqwest::Url::parse(&format!("{}/folders", rest_base(auth))).map_err(|e| e.to_string())?;
  {
    let mut q = url.query_pairs_mut();
    q.append_pair("select", "id,parent_id,name");
    q.append_pair("limit", "10000");
  }
  send_with_refresh(
    client,
    auth,
    || client.get(url.clone()),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("folders fetch failed: HTTP {}", res.status()));
        }
        let rows: Vec<FolderNode> = res.json().await.map_err(|e| e.to_string())?;
        Ok(rows)
      })
    },
  )
  .await
}

fn compute_subtree_folder_ids(project_folder_id: &str, folders: &[FolderNode]) -> Vec<String> {
  let mut children: HashMap<String, Vec<String>> = HashMap::new();
  for f in folders {
    if let Some(pid) = &f.parent_id {
      children.entry(pid.clone()).or_default().push(f.id.clone());
    }
  }

  let mut out = vec![project_folder_id.to_string()];
  let mut i = 0usize;
  while i < out.len() {
    let cur = out[i].clone();
    if let Some(ch) = children.get(&cur) {
      for id in ch {
        out.push(id.clone());
      }
    }
    i += 1;
  }
  out
}

fn folder_rel_from_tree(project_folder_id: &str, folder_id: &str, folders_by_id: &HashMap<String, FolderNode>) -> Option<String> {
  if folder_id == project_folder_id {
    return Some(String::new());
  }
  let mut parts: Vec<String> = Vec::new();
  let mut cur = folder_id.to_string();
  for _ in 0..64 {
    let node = folders_by_id.get(&cur)?;
    parts.push(node.name.clone());
    if let Some(pid) = &node.parent_id {
      if pid == project_folder_id {
        break;
      }
      cur = pid.clone();
    } else {
      return None;
    }
  }
  parts.reverse();
  Some(parts.join("/"))
}

fn reverse_file_map(mapping: &SyncMappingV1) -> HashMap<String, String> {
  let mut out = HashMap::new();
  for (rel, fm) in &mapping.files {
    out.insert(fm.file_id.clone(), rel.clone());
  }
  out
}

async fn fetch_files_updated_since(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  folder_ids: &[String],
  since_iso: &str,
) -> Result<Vec<RemoteFileRow>, String> {
  let mut out: Vec<RemoteFileRow> = Vec::new();
  let chunk_size = 40usize;
  let base = rest_base(auth);

  for chunk in folder_ids.chunks(chunk_size) {
    let list = chunk.join(",");
    let mut url = reqwest::Url::parse(&format!("{}/files", base)).map_err(|e| e.to_string())?;
    {
      let mut q = url.query_pairs_mut();
      q.append_pair("select", "id,name,folder_id,content,updated_at,kind");
      q.append_pair("folder_id", &format!("in.({})", list));
      q.append_pair("updated_at", &format!("gt.{}", since_iso));
      q.append_pair("limit", "10000");
    }
    let mut rows = send_with_refresh(
      client,
      auth,
      || client.get(url.clone()),
      |res| {
        Box::pin(async move {
          if !res.status().is_success() {
            return Err(format!("files fetch failed: HTTP {}", res.status()));
          }
          let rows: Vec<RemoteFileRow> = res.json().await.map_err(|e| e.to_string())?;
          Ok(rows)
        })
      },
    )
    .await?;
    out.append(&mut rows);
  }
  Ok(out)
}

async fn fetch_file_ids_in_folders(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  folder_ids: &[String],
) -> Result<HashSet<String>, String> {
  let mut out: HashSet<String> = HashSet::new();
  let chunk_size = 40usize;
  let base = rest_base(auth);

  for chunk in folder_ids.chunks(chunk_size) {
    let list = chunk.join(",");
    let page_limit = 1000usize;
    let mut offset = 0usize;
    for _ in 0..1000 {
      let mut url = reqwest::Url::parse(&format!("{}/files", base)).map_err(|e| e.to_string())?;
      {
        let mut q = url.query_pairs_mut();
        q.append_pair("select", "id");
        q.append_pair("folder_id", &format!("in.({})", list));
        q.append_pair("limit", &page_limit.to_string());
        q.append_pair("offset", &offset.to_string());
      }
      let rows = send_with_refresh(
        client,
        auth,
        || client.get(url.clone()),
        |res| {
          Box::pin(async move {
            if !res.status().is_success() {
              return Err(format!("files list fetch failed: HTTP {}", res.status()));
            }
            let rows: Vec<RemoteIdRow> = res.json().await.map_err(|e| e.to_string())?;
            Ok(rows)
          })
        },
      )
      .await?;

      let got = rows.len();
      for r in rows {
        out.insert(r.id);
      }
      if got < page_limit {
        break;
      }
      offset += page_limit;
    }
  }

  Ok(out)
}

async fn fetch_resources_updated_since(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  project_folder_id: &str,
  since_iso: &str,
) -> Result<Vec<RemoteResourceRow>, String> {
  let base = rest_base(auth);
  let mut url = reqwest::Url::parse(&format!("{}/project_resources", base)).map_err(|e| e.to_string())?;
  {
    let mut q = url.query_pairs_mut();
    q.append_pair("select", "id,name,markdown,updated_at,source");
    q.append_pair("project_folder_id", &format!("eq.{}", project_folder_id));
    q.append_pair("updated_at", &format!("gt.{}", since_iso));
    q.append_pair("limit", "10000");
  }

  send_with_refresh(
    client,
    auth,
    || client.get(url.clone()),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("project_resources fetch failed: HTTP {}", res.status()));
        }
        let rows: Vec<RemoteResourceRow> = res.json().await.map_err(|e| e.to_string())?;
        Ok(rows)
      })
    },
  )
  .await
}

async fn fetch_resource_ids_for_project(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  project_folder_id: &str,
) -> Result<HashSet<String>, String> {
  let base = rest_base(auth);
  let mut out: HashSet<String> = HashSet::new();
  let page_limit = 1000usize;
  let mut offset = 0usize;
  for _ in 0..1000 {
    let mut url = reqwest::Url::parse(&format!("{}/project_resources", base)).map_err(|e| e.to_string())?;
    {
      let mut q = url.query_pairs_mut();
      q.append_pair("select", "id");
      q.append_pair("project_folder_id", &format!("eq.{}", project_folder_id));
      q.append_pair("limit", &page_limit.to_string());
      q.append_pair("offset", &offset.to_string());
    }
    let rows = send_with_refresh(
      client,
      auth,
      || client.get(url.clone()),
      |res| {
        Box::pin(async move {
          if !res.status().is_success() {
            return Err(format!("project_resources list fetch failed: HTTP {}", res.status()));
          }
          let rows: Vec<RemoteIdRow> = res.json().await.map_err(|e| e.to_string())?;
          Ok(rows)
        })
      },
    )
    .await?;

    let got = rows.len();
    for r in rows {
      out.insert(r.id);
    }
    if got < page_limit {
      break;
    }
    offset += page_limit;
  }
  Ok(out)
}

async fn fetch_one_rag_project(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  project_folder_id: &str,
) -> Result<Option<RagProjectRow>, String> {
  let base = rest_base(auth);
  let mut url = reqwest::Url::parse(&format!("{}/rag_projects", base)).map_err(|e| e.to_string())?;
  {
    let mut q = url.query_pairs_mut();
    q.append_pair("select", "owner_id,project_folder_id,public_id,updated_at");
    q.append_pair("project_folder_id", &format!("eq.{}", project_folder_id));
    q.append_pair("limit", "1");
  }
  send_with_refresh(
    client,
    auth,
    || client.get(url.clone()),
    |res| {
      Box::pin(async move {
        if !res.status().is_success() {
          return Err(format!("rag_projects fetch failed: HTTP {}", res.status()));
        }
        let rows: Vec<RagProjectRow> = res.json().await.map_err(|e| e.to_string())?;
        Ok(rows.into_iter().next())
      })
    },
  )
  .await
}

async fn fetch_paginated<T: for<'de> Deserialize<'de>>(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  table: &str,
  select: &str,
  project_folder_id: &str,
) -> Result<Vec<T>, String> {
  let base = rest_base(auth);
  let table_name = table.to_string();
  let mut out: Vec<T> = Vec::new();
  let page_size: usize = 1000;
  let mut offset: usize = 0;
  loop {
    let mut url = reqwest::Url::parse(&format!("{}/{}", base, table)).map_err(|e| e.to_string())?;
    {
      let mut q = url.query_pairs_mut();
      q.append_pair("select", select);
      q.append_pair("project_folder_id", &format!("eq.{}", project_folder_id));
      q.append_pair("limit", &page_size.to_string());
      q.append_pair("offset", &offset.to_string());
    }
    let mut rows: Vec<T> = send_with_refresh(
      client,
      auth,
      || client.get(url.clone()),
      |res| {
        let table_name = table_name.clone();
        Box::pin(async move {
          if !res.status().is_success() {
            return Err(format!("{} fetch failed: HTTP {}", table_name, res.status()));
          }
          let rows: Vec<T> = res.json().await.map_err(|e| e.to_string())?;
          Ok(rows)
        })
      },
    )
    .await?;
    let n = rows.len();
    out.append(&mut rows);
    if n < page_size {
      break;
    }
    offset += page_size;
    if offset > 200_000 {
      break;
    }
  }
  Ok(out)
}

fn write_jsonl<T: Serialize>(path: &Path, rows: &[T]) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let mut f = OpenOptions::new()
    .create(true)
    .truncate(true)
    .write(true)
    .open(path)
    .map_err(|e| e.to_string())?;
  for r in rows {
    let line = serde_json::to_string(r).map_err(|e| e.to_string())?;
    writeln!(f, "{}", line).map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn write_json(path: &Path, v: &serde_json::Value) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
  fs::write(path, text).map_err(|e| e.to_string())
}

async fn rag_export_into_vault(
  client: &reqwest::Client,
  auth: &mut SupabaseAuth,
  vault_path: &str,
  project_folder_id: &str,
  last_export_at: &str,
) -> Result<Option<String>, String> {
  let rag_project = fetch_one_rag_project(client, auth, project_folder_id).await?;
  let Some(rp) = rag_project else { return Ok(None); };
  let updated_at = rp.updated_at.clone().unwrap_or_else(now_iso);
  if !last_export_at.trim().is_empty() && updated_at.as_str() <= last_export_at.trim() {
    return Ok(None);
  }

  let ents: Vec<KgEntityRow> = fetch_paginated(client, auth, "kg_entities", "owner_id,id,project_folder_id,entity_type,file_id,data,updated_at", project_folder_id).await?;
  let edges: Vec<KgEdgeRow> = fetch_paginated(client, auth, "kg_edges", "owner_id,id,project_folder_id,edge_type,src,dst,data,updated_at", project_folder_id).await?;
  let chunks: Vec<RagChunkRowLite> = fetch_paginated(
    client,
    auth,
    "rag_chunks",
    // Exclude `embedding` (too large/noisy for filesystem sync).
    "owner_id,id,project_folder_id,file_id,resource_id,file_kind,anchor,text,metadata,updated_at",
    project_folder_id,
  )
  .await?;

  let rag_dir = Path::new(vault_path).join("rag");
  write_json(&rag_dir.join("project.json"), &serde_json::to_value(&rp).map_err(|e| e.to_string())?)?;
  write_jsonl(&rag_dir.join("kg_entities.jsonl"), &ents)?;
  write_jsonl(&rag_dir.join("kg_edges.jsonl"), &edges)?;
  write_jsonl(&rag_dir.join("rag_chunks.jsonl"), &chunks)?;

  let _ = append_event(
    vault_path,
    &SyncEvent {
      ts: now_iso(),
      kind: "rag_export".to_string(),
      path: "rag/".to_string(),
      detail: format!(
        "Exported RAG/KG. Entities: {}, edges: {}, chunks: {}.",
        ents.len(),
        edges.len(),
        chunks.len()
      ),
    },
  );

  Ok(Some(updated_at))
}

#[tauri::command]
pub async fn sync_pull_once(vault_path: String, project_folder_id: String, auth: SupabaseAuth) -> Result<SyncSummary, String> {
  let root = Path::new(&vault_path);
  if !root.exists() {
    return Err("vault_path does not exist".to_string());
  }

  let client = reqwest::Client::new();
  let mut auth = auth;
  let mut mapping = match read_mapping(&vault_path)? {
    Some(m) => m,
    None => sync_init(vault_path.clone(), project_folder_id.clone()).await?,
  };
  if mapping.project_folder_id != project_folder_id {
    return Err("mapping project_folder_id mismatch".to_string());
  }

  let since = if mapping.last_pull_at.trim().is_empty() {
    "1970-01-01T00:00:00Z".to_string()
  } else {
    mapping.last_pull_at.clone()
  };

  let folders = fetch_all_folders(&client, &mut auth).await?;
  let folders_by_id: HashMap<String, FolderNode> = folders.into_iter().map(|f| (f.id.clone(), f)).collect();
  let folder_vec: Vec<FolderNode> = folders_by_id.values().cloned().collect();
  let folder_ids = compute_subtree_folder_ids(&project_folder_id, &folder_vec);
  let remote_file_ids = fetch_file_ids_in_folders(&client, &mut auth, &folder_ids).await?;
  let remote_files = fetch_files_updated_since(&client, &mut auth, &folder_ids, &since).await?;
  let remote_resource_ids = fetch_resource_ids_for_project(&client, &mut auth, &project_folder_id).await?;
  let remote_resources = fetch_resources_updated_since(&client, &mut auth, &project_folder_id, &since).await?;

  let mut summary = SyncSummary::default();
  let by_file_id = reverse_file_map(&mapping);
  let mut conflicts: u32 = 0;

  for rf in remote_files {
    let remote_updated_at = rf.updated_at.clone().unwrap_or_else(|| now_iso());
    let remote_content = rf.content.clone().unwrap_or_default();
    let remote_kind = rf.kind.clone().unwrap_or_else(|| "note".to_string());

    let folder_id = rf.folder_id.clone().unwrap_or(project_folder_id.clone());
    let folder_rel = mapping
      .folders
      .iter()
      .find_map(|(rel, id)| if id == &folder_id { Some(rel.clone()) } else { None })
      .or_else(|| folder_rel_from_tree(&project_folder_id, &folder_id, &folders_by_id))
      .unwrap_or_default();

    let target_dir = if folder_rel.is_empty() { root.to_path_buf() } else { root.join(&folder_rel) };
    if let Err(e) = fs::create_dir_all(&target_dir) {
      summary.errors.push(e.to_string());
      continue;
    }

    let rel_path = by_file_id.get(&rf.id).cloned().unwrap_or_else(|| {
      if folder_rel.is_empty() {
        rf.name.clone()
      } else {
        format!("{}/{}", folder_rel, rf.name)
      }
    });

    let abs_path = root.join(&rel_path);
    let local_bytes = fs::read(&abs_path).ok();
    let local_hash = local_bytes.as_ref().map(|b| sha256_hex(b)).unwrap_or_default();

    let prev = mapping.files.get(&rel_path).cloned();
    let prev_local_hash = prev.as_ref().map(|m| m.local_hash.clone()).unwrap_or_default();
    let prev_remote_updated = prev.as_ref().map(|m| m.remote_updated_at.clone()).unwrap_or_default();

    let local_modified = !prev_local_hash.is_empty() && local_hash != prev_local_hash;
    let remote_newer = !prev_remote_updated.is_empty() && remote_updated_at > prev_remote_updated;

    if local_modified && remote_newer {
      // Conflict: write remote to a sibling conflict file.
      let ts = Utc::now().format("%Y-%m-%dT%H%M%SZ").to_string();
      let stem = abs_path.file_stem().and_then(|s| s.to_str()).unwrap_or("conflict");
      let ext = abs_path.extension().and_then(|e| e.to_str()).unwrap_or("md");
      let conflict_name = format!("{stem} (conflict from NexusMap {ts}).{ext}");
      let conflict_path = abs_path.with_file_name(conflict_name);
      if let Err(e) = fs::write(&conflict_path, &remote_content) {
        summary.errors.push(e.to_string());
      }
      let _ = append_event(
        &vault_path,
        &SyncEvent {
          ts: now_iso(),
          kind: "conflict".to_string(),
          path: rel_path.clone(),
          detail: format!("Remote update would overwrite local edits. Wrote {}", conflict_path.display()),
        },
      );
      conflicts += 1;
      continue;
    }

    if let Err(e) = fs::write(&abs_path, &remote_content) {
      summary.errors.push(e.to_string());
      continue;
    }

    let next_hash = sha256_hex(remote_content.as_bytes());
    if prev.is_some() {
      summary.files_updated += 1;
    } else {
      summary.files_created += 1;
    }
    mapping.files.insert(
      rel_path.clone(),
      FileMappingV1 {
        file_id: rf.id.clone(),
        folder_id: folder_id.clone(),
        kind: remote_kind,
        local_hash: next_hash,
        remote_updated_at,
      },
    );
  }

  for rr in remote_resources {
    let remote_updated_at = rr.updated_at.clone().unwrap_or_else(now_iso);
    let mut rel_path = format!("resources/{}", rr.name);
    if let Some(src) = rr.source.as_ref() {
      if src.get("type").and_then(|v| v.as_str()) == Some("docling") {
        rel_path = format!("resources/docling/{}", rr.name);
      }
    }
    let abs_path = root.join(&rel_path);
    if let Some(parent) = abs_path.parent() {
      if let Err(e) = fs::create_dir_all(parent) {
        summary.errors.push(e.to_string());
        continue;
      }
    }

    let local_bytes = fs::read(&abs_path).ok();
    let local_hash = local_bytes.as_ref().map(|b| sha256_hex(b)).unwrap_or_default();
    let content_hash = sha256_hex(rr.markdown.as_bytes());

    let prev = mapping.resources.get(&rel_path).cloned();
    let prev_local_hash = prev.as_ref().map(|m| m.local_hash.clone()).unwrap_or_default();
    let prev_remote_updated = prev.as_ref().map(|m| m.remote_updated_at.clone()).unwrap_or_default();

    let local_modified = !prev_local_hash.is_empty() && local_hash != prev_local_hash;
    let remote_newer = !prev_remote_updated.is_empty() && remote_updated_at > prev_remote_updated;

    if local_modified && remote_newer {
      let ts = Utc::now().format("%Y-%m-%dT%H%M%SZ").to_string();
      let stem = abs_path.file_stem().and_then(|s| s.to_str()).unwrap_or("resource");
      let ext = abs_path.extension().and_then(|e| e.to_str()).unwrap_or("md");
      let conflict_name = format!("{stem} (conflict from NexusMap {ts}).{ext}");
      let conflict_path = abs_path.with_file_name(conflict_name);
      if let Err(e) = fs::write(&conflict_path, rr.markdown.as_bytes()) {
        summary.errors.push(e.to_string());
      }
      let _ = append_event(
        &vault_path,
        &SyncEvent {
          ts: now_iso(),
          kind: "conflict".to_string(),
          path: rel_path.clone(),
          detail: format!("Remote resource update would overwrite local edits. Wrote {}", conflict_path.display()),
        },
      );
      conflicts += 1;
      continue;
    }

    if let Err(e) = fs::write(&abs_path, rr.markdown.as_bytes()) {
      summary.errors.push(e.to_string());
      continue;
    }

    mapping.resources.insert(
      rel_path.clone(),
      ResourceMappingV1 {
        resource_id: rr.id.clone(),
        local_hash: content_hash,
        remote_updated_at,
      },
    );
  }

  // Reconcile remote deletions (safe: archive local to `.nexusmap/trash/...`).
  let mut to_remove_files: Vec<String> = Vec::new();
  for (rel, fm) in &mapping.files {
    if !remote_file_ids.contains(&fm.file_id) {
      to_remove_files.push(rel.clone());
    }
  }
  for rel in to_remove_files {
    let _ = archive_file_to_trash(&vault_path, &rel);
    mapping.files.remove(&rel);
    summary.files_deleted += 1;
    let _ = append_event(
      &vault_path,
      &SyncEvent {
        ts: now_iso(),
        kind: "pull_delete".to_string(),
        path: rel.clone(),
        detail: "Remote file was deleted; archived local copy to .nexusmap/trash/".to_string(),
      },
    );
  }

  let mut to_remove_resources: Vec<String> = Vec::new();
  for (rel, rm) in &mapping.resources {
    if !remote_resource_ids.contains(&rm.resource_id) {
      to_remove_resources.push(rel.clone());
    }
  }
  for rel in to_remove_resources {
    let _ = archive_file_to_trash(&vault_path, &rel);
    mapping.resources.remove(&rel);
    summary.resources_deleted += 1;
    let _ = append_event(
      &vault_path,
      &SyncEvent {
        ts: now_iso(),
        kind: "pull_delete".to_string(),
        path: rel.clone(),
        detail: "Remote resource was deleted; archived local copy to .nexusmap/trash/".to_string(),
      },
    );
  }

  // Export RAG/KG into vault if KB updated since last export.
  // This keeps `rag/` in sync even if the KB was rebuilt from the web app.
  if let Ok(Some(rag_updated_at)) =
    rag_export_into_vault(&client, &mut auth, &vault_path, &project_folder_id, &mapping.last_rag_export_at).await
  {
    mapping.last_rag_export_at = rag_updated_at;
  }

  mapping.last_pull_at = now_iso();
  mapping.updated_at = now_iso();
  write_mapping(&vault_path, &mapping)?;
  let _ = append_event(
    &vault_path,
    &SyncEvent {
      ts: now_iso(),
      kind: "pull".to_string(),
      path: String::new(),
      detail: format!(
        "Pulled. Files created: {}, updated: {}, deleted: {}. Resources deleted: {}. Conflicts: {}. Errors: {}.",
        summary.files_created,
        summary.files_updated,
        summary.files_deleted,
        summary.resources_deleted,
        conflicts,
        summary.errors.len()
      ),
    },
  );
  Ok(summary)
}

#[tauri::command]
pub async fn sync_pull_start(vault_path: String, project_folder_id: String, auth: SupabaseAuth, interval_ms: Option<u64>) -> Result<(), String> {
  let mut guard = PULL_STATE.lock().map_err(|_| "pull state lock poisoned".to_string())?;
  let key = sync_key(&vault_path, &project_folder_id);
  if guard.contains_key(&key) {
    return Err("remote poller already running for this project".to_string());
  }
  let (stop_tx, stop_rx) = mpsc::channel::<()>();
  let interval = interval_ms.unwrap_or(5000);

  std::thread::spawn(move || loop {
    if stop_rx.try_recv().is_ok() {
      break;
    }
    let _ = tauri::async_runtime::block_on(sync_pull_once(vault_path.clone(), project_folder_id.clone(), auth.clone()));
    std::thread::sleep(std::time::Duration::from_millis(interval));
  });

  guard.insert(key, PullState { stop_tx });
  Ok(())
}

#[tauri::command]
pub async fn sync_pull_stop() -> Result<(), String> {
  let mut guard = PULL_STATE.lock().map_err(|_| "pull state lock poisoned".to_string())?;
  for (_, st) in guard.drain() {
    let _ = st.stop_tx.send(());
  }
  Ok(())
}

#[tauri::command]
pub async fn sync_read_events(vault_path: String, limit: Option<u32>) -> Result<Vec<SyncEvent>, String> {
  read_events(&vault_path, limit.unwrap_or(50) as usize)
}

#[tauri::command]
pub async fn rag_export_once(vault_path: String, project_folder_id: String, auth: SupabaseAuth) -> Result<(), String> {
  let root = Path::new(&vault_path);
  if !root.exists() {
    return Err("vault_path does not exist".to_string());
  }
  let client = reqwest::Client::new();
  let mut auth = auth;
  let mut mapping = match read_mapping(&vault_path)? {
    Some(m) => m,
    None => sync_init(vault_path.clone(), project_folder_id.clone()).await?,
  };
  if mapping.project_folder_id != project_folder_id {
    return Err("mapping project_folder_id mismatch".to_string());
  }
  if let Some(rag_updated_at) =
    rag_export_into_vault(&client, &mut auth, &vault_path, &project_folder_id, &mapping.last_rag_export_at).await?
  {
    mapping.last_rag_export_at = rag_updated_at;
    mapping.updated_at = now_iso();
    write_mapping(&vault_path, &mapping)?;
  }
  Ok(())
}

#[tauri::command]
pub async fn vault_write_text_file(vault_path: String, relative_path: String, content: String) -> Result<(), String> {
  let root = Path::new(&vault_path);
  if !root.exists() {
    return Err("vault_path does not exist".to_string());
  }

  let rel = Path::new(&relative_path);
  if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
    return Err("relative_path must stay within the vault".to_string());
  }

  let target = root.join(rel);
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  fs::write(&target, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vault_ensure_dir(vault_path: String, relative_path: String) -> Result<(), String> {
  let root = Path::new(&vault_path);
  if !root.exists() {
    return Err("vault_path does not exist".to_string());
  }

  let rel = Path::new(&relative_path);
  if rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
    return Err("relative_path must stay within the vault".to_string());
  }

  let target = root.join(rel);
  fs::create_dir_all(&target).map_err(|e| e.to_string())
}

