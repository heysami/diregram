use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RagIngestRequest {
  pub project_folder_id: String,
  pub access_token: String,
  pub api_base_url: String,
  pub openai_api_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct RagIngestBody {
  #[serde(rename = "projectFolderId")]
  project_folder_id: String,
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
  let chunk_limit: u32 = 48;
  let openai_key = req
    .openai_api_key
    .clone()
    .unwrap_or_default()
    .trim()
    .to_string();
  let has_openai_key = !openai_key.is_empty();
  let mut reqb = client
    .post(url.clone())
    .header("content-type", "application/json")
    .header("authorization", format!("Bearer {}", req.access_token.trim()));
  if has_openai_key {
    reqb = reqb.header("x-openai-api-key", openai_key.clone());
  }
  let res = reqb
    .json(&RagIngestBody {
      project_folder_id: req.project_folder_id.trim().to_string(),
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
  let async_enabled = json.get("async").and_then(|v| v.as_bool()).unwrap_or(false);
  let job_id = json
    .get("jobId")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .trim()
    .to_string();
  if !async_enabled || job_id.is_empty() {
    return Ok(json);
  }

  let poll_url = json
    .get("pollUrl")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string())
    .unwrap_or_else(|| format!("{}/api/async-jobs/{}", base, job_id));

  for _ in 0..10_000u32 {
    let poll_res = client
      .get(&poll_url)
      .header("authorization", format!("Bearer {}", req.access_token.trim()))
      .send()
      .await
      .map_err(|e| format!("poll request failed: {}", e))?;
    let poll_status = poll_res.status();
    let poll_text = poll_res.text().await.map_err(|e| e.to_string())?;
    if !poll_status.is_success() {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&poll_text) {
        let msg = v
          .get("error")
          .and_then(|x| x.as_str())
          .map(|s| s.to_string())
          .unwrap_or_else(|| v.to_string());
        return Err(format!("Poll HTTP {}: {}", poll_status.as_u16(), msg));
      }
      return Err(format!("Poll HTTP {}: {}", poll_status.as_u16(), poll_text));
    }

    let poll_json = serde_json::from_str::<serde_json::Value>(&poll_text)
      .map_err(|e| format!("bad poll JSON: {}: {}", e, poll_text))?;
    let state = poll_json
      .get("job")
      .and_then(|j| j.get("status"))
      .and_then(|v| v.as_str())
      .unwrap_or("");

    if state == "succeeded" {
      return Ok(
        poll_json
          .get("result")
          .cloned()
          .unwrap_or_else(|| serde_json::json!({ "ok": true, "jobId": job_id })),
      );
    }
    if state == "failed" || state == "cancelled" {
      let msg = poll_json
        .get("job")
        .and_then(|j| j.get("error"))
        .and_then(|v| v.as_str())
        .unwrap_or("Async ingest failed");
      return Err(msg.to_string());
    }

    tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
  }

  Err("Async ingest timed out".to_string())
}
