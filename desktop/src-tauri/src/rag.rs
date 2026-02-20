use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RagIngestRequest {
  pub project_folder_id: String,
  pub access_token: String,
  pub api_base_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct RagIngestBody {
  #[serde(rename = "projectFolderId")]
  project_folder_id: String,
  #[serde(rename = "cursor")]
  cursor: u32,
  #[serde(rename = "chunkLimit")]
  chunk_limit: u32,
}

#[tauri::command]
pub async fn rag_ingest_jwt(req: RagIngestRequest) -> Result<serde_json::Value, String> {
  let base = req.api_base_url.trim().trim_end_matches('/').to_string();
  if base.is_empty() {
    return Err("api_base_url is required".to_string());
  }
  if req.project_folder_id.trim().is_empty() {
    return Err("project_folder_id is required".to_string());
  }
  if req.access_token.trim().is_empty() {
    return Err("access_token is required".to_string());
  }

  let url = format!("{}/api/rag/ingest-jwt", base);
  let client = reqwest::Client::new();
  let mut cursor: u32 = 0;
  let chunk_limit: u32 = 48;
  let mut last_json: serde_json::Value = serde_json::json!({});
  for _ in 0..10_000u32 {
    let res = client
      .post(url.clone())
      .header("content-type", "application/json")
      .header("authorization", format!("Bearer {}", req.access_token.trim()))
      .json(&RagIngestBody {
        project_folder_id: req.project_folder_id.trim().to_string(),
        cursor,
        chunk_limit,
      })
      .send()
      .await
      .map_err(|e| format!("request failed: {}", e))?;

    let status = res.status();
    let vercel_id = res
      .headers()
      .get("x-vercel-id")
      .and_then(|v| v.to_str().ok())
      .map(|s| s.to_string());
    let text = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
      if text.trim().is_empty() {
        return Err(format!(
          "HTTP {}: (empty response body){}",
          status.as_u16(),
          vercel_id.map(|id| format!(" [x-vercel-id: {}]", id)).unwrap_or_default()
        ));
      }
      // Try parse JSON error body
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
        let msg = v
          .get("error")
          .and_then(|x| x.as_str())
          .map(|s| s.to_string())
          .unwrap_or_else(|| v.to_string());
        return Err(format!(
          "HTTP {}: {}{}",
          status.as_u16(),
          msg,
          vercel_id.map(|id| format!(" [x-vercel-id: {}]", id)).unwrap_or_default()
        ));
      }
      return Err(format!(
        "HTTP {}: {}{}",
        status.as_u16(),
        text,
        vercel_id.map(|id| format!(" [x-vercel-id: {}]", id)).unwrap_or_default()
      ));
    }

    let json = serde_json::from_str::<serde_json::Value>(&text).map_err(|e| format!("bad JSON: {}: {}", e, text))?;
    last_json = json.clone();
    let done = json
      .get("ingest")
      .and_then(|v| v.get("done"))
      .and_then(|v| v.as_bool())
      .unwrap_or(true);
    let next = json
      .get("ingest")
      .and_then(|v| v.get("nextCursor"))
      .and_then(|v| v.as_u64())
      .unwrap_or(0) as u32;
    if done {
      return Ok(last_json);
    }
    // Prevent infinite loops if server doesn't advance cursor
    if next <= cursor {
      return Err(format!("RAG ingest stalled at cursor {}", cursor));
    }
    cursor = next;
  }
  Ok(last_json)
}

