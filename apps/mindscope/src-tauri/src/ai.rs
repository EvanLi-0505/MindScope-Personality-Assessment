//! Optional AI features: the only part of MindScope that talks to the network
//! on its own (after the user turned AI on and confirmed each request).
//!
//! - The API key lives only here. It is saved with Windows DPAPI in
//!   `config/ai-key.dat` (or kept in memory for this run) and is never sent
//!   back to the UI, written to logs, the database, backups or reports.
//! - Provider address and model are read from the saved settings, not taken
//!   from the request, and only `https://` (or `http://` to this computer) is
//!   allowed.
//! - Every request is recorded in `network_audit` (no content, no key).

use crate::commands::AppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::Notify;

const KEY_FILE: &str = "ai-key.dat";
const MAX_KEY_LEN: usize = 512;
const MAX_ERROR_BODY: usize = 4096;

#[derive(Default)]
pub struct AiState {
    /// Key used for this run only ("do not save").
    session_key: Mutex<Option<String>>,
    /// Running requests, so the UI can cancel them.
    running: Mutex<HashMap<String, Arc<Notify>>>,
}

// ── settings (written by the UI into app_settings 'ai.config') ───────────

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f64,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
}
fn default_temperature() -> f64 {
    0.7
}
fn default_max_tokens() -> u32 {
    1500
}
fn default_timeout() -> u64 {
    90
}

fn load_config(state: &AppState) -> Result<AiConfig, AiError> {
    let rows = state
        .db
        .query("SELECT value_json FROM app_settings WHERE key = 'ai.config'", &[])
        .map_err(|e| AiError::new("internal", e))?;
    let raw = rows.first().and_then(|r| r.get("value_json")).and_then(Value::as_str).unwrap_or("{}");
    let cfg: AiConfig = serde_json::from_str(raw).map_err(|_| AiError::new("not_enabled", "AI settings are missing"))?;
    if !cfg.enabled {
        return Err(AiError::new("not_enabled", "AI is turned off"));
    }
    if cfg.model.trim().is_empty() || cfg.model.len() > 200 {
        return Err(AiError::new("bad_config", "model name is missing"));
    }
    Ok(cfg)
}

// ── errors: a code the UI translates, plus a short safe message ──────────

#[derive(Serialize, Debug)]
pub struct AiError {
    pub code: String,
    pub status: Option<u16>,
    pub message: String,
}
impl AiError {
    fn new(code: &str, message: impl Into<String>) -> AiError {
        AiError { code: code.into(), status: None, message: message.into() }
    }
    /// Removes the key (and anything after "Bearer") from a message.
    fn redacted(mut self, key: &str) -> AiError {
        self.message = redact(&self.message, key);
        self
    }
}
fn to_cmd_error(e: AiError) -> String {
    serde_json::to_string(&e).unwrap_or_else(|_| r#"{"code":"internal","message":""}"#.into())
}

pub fn redact(text: &str, key: &str) -> String {
    let mut out = text.to_string();
    if key.len() >= 4 {
        out = out.replace(key, "[key]");
    }
    // "Bearer <token>" can appear in echoed headers.
    if let Some(i) = out.find("Bearer ") {
        let end = out[i + 7..].find(|c: char| c.is_whitespace() || c == '"').map_or(out.len(), |j| i + 7 + j);
        out.replace_range(i + 7..end, "[key]");
    }
    out.chars().take(500).collect()
}

// ── address validation ──────────────────────────────────────────────────

/// `https://` anywhere, `http://` only to this computer (local models).
pub fn chat_endpoint(base_url: &str) -> Result<reqwest::Url, AiError> {
    let bad = |m: &str| AiError::new("bad_url", m.to_string());
    let base = reqwest::Url::parse(base_url.trim()).map_err(|_| bad("not a valid address"))?;
    if !base.username().is_empty() || base.password().is_some() || base.query().is_some() || base.fragment().is_some() {
        return Err(bad("the address must not contain a user name, query or fragment"));
    }
    let host = base.host_str().unwrap_or("");
    match base.scheme() {
        "https" if !host.is_empty() => {}
        "http" if matches!(host, "localhost" | "127.0.0.1" | "[::1]") => {}
        "http" => return Err(bad("plain http is only allowed for this computer; use https")),
        _ => return Err(bad("only https addresses are allowed")),
    }
    let path = format!("{}/chat/completions", base.path().trim_end_matches('/'));
    let mut url = base.clone();
    url.set_path(&path);
    Ok(url)
}

// ── key storage ─────────────────────────────────────────────────────────

fn validate_key(key: &str) -> Result<&str, String> {
    let key = key.trim();
    if key.is_empty() || key.len() > MAX_KEY_LEN || !key.chars().all(|c| c.is_ascii_graphic()) {
        return Err("invalid key".into());
    }
    Ok(key)
}

fn key_path(state: &AppState) -> PathBuf {
    state.paths.config.join(KEY_FILE)
}

fn read_saved_key(path: &Path) -> Option<String> {
    let blob = std::fs::read(path).ok()?;
    let plain = protect::unprotect(&blob).ok()?;
    String::from_utf8(plain).ok()
}

fn current_key(state: &AppState) -> Option<String> {
    if let Some(k) = state.ai.session_key.lock().ok().and_then(|g| g.clone()) {
        return Some(k);
    }
    read_saved_key(&key_path(state))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    /// "saved" (encrypted on disk), "session" (this run only), "none", or
    /// "unreadable" (a saved key exists but cannot be decrypted here).
    state: &'static str,
    /// Last four characters, for recognition only.
    hint: Option<String>,
    /// Whether this system can store the key encrypted.
    secure_storage: bool,
}

fn hint(key: &str) -> String {
    let tail: String = key.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("••••{tail}")
}

fn status(state: &AppState) -> KeyStatus {
    let secure_storage = protect::AVAILABLE;
    if let Some(k) = state.ai.session_key.lock().ok().and_then(|g| g.clone()) {
        return KeyStatus { state: "session", hint: Some(hint(&k)), secure_storage };
    }
    let path = key_path(state);
    if !path.exists() {
        return KeyStatus { state: "none", hint: None, secure_storage };
    }
    match read_saved_key(&path) {
        Some(k) => KeyStatus { state: "saved", hint: Some(hint(&k)), secure_storage },
        None => KeyStatus { state: "unreadable", hint: None, secure_storage },
    }
}

#[tauri::command]
pub fn ai_key_status(state: State<'_, AppState>) -> KeyStatus {
    status(&state)
}

/// `persist`: encrypt and save; otherwise keep in memory for this run and
/// remove any saved key so there is only one.
#[tauri::command]
pub fn ai_key_save(state: State<'_, AppState>, key: String, persist: bool) -> Result<KeyStatus, String> {
    let key = validate_key(&key)?.to_string();
    let path = key_path(&state);
    if persist {
        let blob = protect::protect(key.as_bytes())?;
        std::fs::create_dir_all(&state.paths.config).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, blob).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        *state.ai.session_key.lock().map_err(|e| e.to_string())? = None;
        tracing::info!("ai key saved (encrypted)");
    } else {
        let _ = std::fs::remove_file(&path);
        *state.ai.session_key.lock().map_err(|e| e.to_string())? = Some(key);
        tracing::info!("ai key set for this session only");
    }
    Ok(status(&state))
}

#[tauri::command]
pub fn ai_key_clear(state: State<'_, AppState>) -> Result<KeyStatus, String> {
    *state.ai.session_key.lock().map_err(|e| e.to_string())? = None;
    let path = key_path(&state);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    tracing::info!("ai key removed");
    Ok(status(&state))
}

// ── chat ────────────────────────────────────────────────────────────────

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub request_id: String,
    pub messages: Vec<ChatMessage>,
    /// For the network record: what this request is for, and which kinds of data it carries.
    pub purpose: String,
    pub categories: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChatEvent {
    Delta { text: String },
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatOutcome {
    pub content: String,
    pub model: String,
    pub tokens: Option<u64>,
    pub ms: u64,
    pub cancelled: bool,
}

/// One request to the configured provider, streamed back through `on_event`.
#[tauri::command]
pub async fn ai_chat(state: State<'_, AppState>, request: ChatRequest, on_event: Channel<ChatEvent>) -> Result<ChatOutcome, String> {
    let cfg = load_config(&state).map_err(to_cmd_error)?;
    let url = chat_endpoint(&cfg.base_url).map_err(to_cmd_error)?;
    let key = current_key(&state).ok_or_else(|| to_cmd_error(AiError::new("no_key", "no API key")))?;
    if request.messages.is_empty() || request.request_id.len() > 64 || request.purpose.len() > 64 {
        return Err(to_cmd_error(AiError::new("bad_request", "invalid request")));
    }

    let cancel = Arc::new(Notify::new());
    state.ai.running.lock().map_err(|e| e.to_string())?.insert(request.request_id.clone(), cancel.clone());

    let body = json!({
        "model": cfg.model,
        "messages": request.messages,
        "temperature": cfg.temperature.clamp(0.0, 2.0),
        "max_tokens": cfg.max_tokens.clamp(64, 8192),
        "stream": true,
        "stream_options": { "include_usage": true },
    });
    let bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    let started = Instant::now();
    let result = run_chat(&url, &key, bytes.clone(), Duration::from_secs(cfg.timeout_secs.clamp(10, 600)), cancel, |text| {
        let _ = on_event.send(ChatEvent::Delta { text });
    })
    .await;
    if let Ok(mut running) = state.ai.running.lock() {
        running.remove(&request.request_id);
    }

    let ms = started.elapsed().as_millis() as u64;
    let outcome_label = match &result {
        Ok(o) if o.cancelled => "cancelled".to_string(),
        Ok(_) => "ok".to_string(),
        Err(e) => e.status.map_or(e.code.clone(), |s| format!("{} ({s})", e.code)),
    };
    let tokens = result.as_ref().ok().and_then(|o| o.tokens);
    audit(&state, &url, &request.purpose, &request.categories, bytes.len(), &outcome_label, &cfg.model, tokens);
    tracing::info!(purpose = %request.purpose, host = url.host_str().unwrap_or(""), outcome = %outcome_label, ms, "ai request");

    result
        .map(|mut o| {
            o.ms = ms;
            o.model = cfg.model.clone();
            o
        })
        .map_err(|e| to_cmd_error(e.redacted(&key)))
}

#[tauri::command]
pub fn ai_cancel(state: State<'_, AppState>, request_id: String) {
    if let Some(n) = state.ai.running.lock().ok().and_then(|r| r.get(&request_id).cloned()) {
        n.notify_one();
    }
}

fn audit(state: &AppState, url: &reqwest::Url, purpose: &str, categories: &[String], bytes: usize, outcome: &str, model: &str, tokens: Option<u64>) {
    let endpoint = format!("{}://{}{}", url.scheme(), url.host_str().unwrap_or(""), url.path());
    let id = format!("net-{}-{:08x}", chrono::Utc::now().format("%Y%m%d%H%M%S%3f"), rand_u32());
    let at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let cats = serde_json::to_string(categories).unwrap_or_else(|_| "[]".into());
    let res = state.db.execute(
        "INSERT INTO network_audit (id, at, endpoint, purpose, categories_json, bytes, outcome, model, tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            json!(id),
            json!(at),
            json!(endpoint),
            json!(purpose),
            json!(cats),
            json!(bytes as i64),
            json!(outcome),
            json!(model),
            json!(tokens.unwrap_or(0) as i64),
        ],
    );
    if let Err(e) = res {
        tracing::warn!("network audit not written: {e}");
    }
}

fn rand_u32() -> u32 {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(Instant::now().elapsed().as_nanos());
    h.finish() as u32
}

/// The HTTP part, without Tauri state (unit-tested against a local server).
pub async fn run_chat(
    url: &reqwest::Url,
    key: &str,
    body: Vec<u8>,
    timeout: Duration,
    cancel: Arc<Notify>,
    mut on_delta: impl FnMut(String),
) -> Result<ChatOutcome, AiError> {
    use futures_util::StreamExt;

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(timeout)
        .user_agent(concat!("MindScope/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AiError::new("internal", e.to_string()))?;
    let send = client
        .post(url.clone())
        .bearer_auth(key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT, "text/event-stream, application/json")
        .body(body)
        .send();
    let resp = tokio::select! {
        r = send => r.map_err(net_error)?,
        _ = cancel.notified() => return Ok(ChatOutcome { cancelled: true, ..Default::default() }),
    };

    let status = resp.status();
    if !status.is_success() {
        let text = read_limited(resp).await;
        return Err(http_error(status.as_u16(), &text));
    }

    let is_json = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("application/json"));
    let mut out = ChatOutcome::default();
    if is_json {
        // A server that ignored "stream": one JSON answer.
        let text = read_limited_all(resp).await?;
        let v: Value = serde_json::from_str(&text).map_err(|_| AiError::new("bad_response", "unexpected response"))?;
        let content = v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
        if !content.is_empty() {
            on_delta(content.clone());
        }
        out.content = content;
        out.tokens = v["usage"]["total_tokens"].as_u64();
        return finish(out);
    }

    let mut parser = SseParser::default();
    let mut stream = resp.bytes_stream();
    loop {
        let chunk = tokio::select! {
            c = stream.next() => c,
            _ = cancel.notified() => { out.cancelled = true; break; }
        };
        let Some(chunk) = chunk else { break };
        let chunk = chunk.map_err(net_error)?;
        let mut done = false;
        for item in parser.push(&chunk) {
            match item {
                SseItem::Delta(t) => {
                    out.content.push_str(&t);
                    on_delta(t);
                }
                SseItem::Usage(n) => out.tokens = Some(n),
                SseItem::Error(m) => return Err(AiError::new("provider_error", m)),
                SseItem::Done => done = true,
            }
        }
        if done {
            break;
        }
    }
    if out.cancelled {
        return Ok(out);
    }
    finish(out)
}

fn finish(out: ChatOutcome) -> Result<ChatOutcome, AiError> {
    if out.content.trim().is_empty() {
        return Err(AiError::new("empty", "the provider returned no text"));
    }
    Ok(out)
}

fn net_error(e: reqwest::Error) -> AiError {
    let code = if e.is_timeout() {
        "timeout"
    } else if e.is_connect() {
        "network"
    } else {
        "network"
    };
    // reqwest messages contain the URL but never headers.
    AiError::new(code, e.to_string())
}

async fn read_limited(resp: reqwest::Response) -> String {
    read_limited_all(resp).await.unwrap_or_default().chars().take(MAX_ERROR_BODY).collect()
}

async fn read_limited_all(resp: reqwest::Response) -> Result<String, AiError> {
    resp.text().await.map_err(net_error)
}

/// Maps an HTTP error to a code. Provider messages are kept short.
pub fn http_error(status: u16, body: &str) -> AiError {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let msg = v["error"]["message"]
        .as_str()
        .or_else(|| v["message"].as_str())
        .map(str::to_string)
        .unwrap_or_else(|| body.chars().take(200).collect());
    let lower = msg.to_lowercase();
    let code = match status {
        401 | 403 => "invalid_key",
        404 => "not_found",
        429 if lower.contains("quota") || lower.contains("billing") || lower.contains("arrear") => "quota",
        429 => "rate_limit",
        400 | 422 => "bad_request",
        500..=599 => "server",
        _ => "http",
    };
    AiError { code: code.into(), status: Some(status), message: msg.chars().take(300).collect() }
}

// ── SSE parsing ─────────────────────────────────────────────────────────

#[derive(Debug, PartialEq)]
pub enum SseItem {
    Delta(String),
    Usage(u64),
    Error(String),
    Done,
}

/// Splits a byte stream into `data:` lines. Works on bytes so a UTF-8
/// character split across two chunks is not broken.
#[derive(Default)]
pub struct SseParser {
    buf: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<SseItem> {
        self.buf.extend_from_slice(chunk);
        let mut items = Vec::new();
        while let Some(pos) = self.buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = self.buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            let Some(data) = line.strip_prefix("data:") else { continue };
            let data = data.trim();
            if data == "[DONE]" {
                items.push(SseItem::Done);
                continue;
            }
            let Ok(v) = serde_json::from_str::<Value>(data) else { continue };
            if let Some(m) = v["error"]["message"].as_str() {
                items.push(SseItem::Error(m.chars().take(300).collect()));
                continue;
            }
            if let Some(t) = v["choices"][0]["delta"]["content"].as_str() {
                if !t.is_empty() {
                    items.push(SseItem::Delta(t.to_string()));
                }
            }
            if let Some(n) = v["usage"]["total_tokens"].as_u64() {
                items.push(SseItem::Usage(n));
            }
        }
        items
    }
}

// ── DPAPI ───────────────────────────────────────────────────────────────

#[cfg(windows)]
mod protect {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

    pub const AVAILABLE: bool = true;
    /// Extra entropy: a blob made for MindScope cannot be opened by another
    /// program's plain CryptUnprotectData call.
    const ENTROPY: &[u8] = b"MindScope ai-key v1";

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
    }

    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out.pbData as *mut _)));
        v
    }

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(plain);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(&input, windows::core::w!("MindScope AI key"), Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
                .map_err(|e| e.message())?;
            Ok(take(out))
        }
    }

    pub fn unprotect(sealed: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(sealed);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(&input, None, Some(&entropy), None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out).map_err(|e| e.message())?;
            Ok(take(out))
        }
    }
}

#[cfg(not(windows))]
mod protect {
    pub const AVAILABLE: bool = false;
    pub fn protect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("secure key storage is not available on this system; use 'this session only'".into())
    }
    pub fn unprotect(_: &[u8]) -> Result<Vec<u8>, String> {
        Err("secure key storage is not available on this system".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    #[test]
    fn endpoints_are_validated() {
        assert_eq!(
            chat_endpoint("https://dashscope.aliyuncs.com/compatible-mode/v1").unwrap().as_str(),
            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        );
        assert_eq!(chat_endpoint("https://x.example/v1/").unwrap().path(), "/v1/chat/completions");
        assert!(chat_endpoint("http://127.0.0.1:11434/v1").is_ok());
        assert!(chat_endpoint("http://localhost:8080/v1").is_ok());
        for bad in ["http://example.com/v1", "ftp://x/v1", "https://user:pw@x.com/v1", "https://x.com/v1?k=1", "not a url", "file:///c:/x"] {
            assert_eq!(chat_endpoint(bad).unwrap_err().code, "bad_url", "{bad}");
        }
    }

    #[test]
    fn keys_are_redacted() {
        let key = "sk-1234567890abcdef";
        let msg = format!("Incorrect API key provided: {key}. Authorization: Bearer {key}");
        let r = redact(&msg, key);
        assert!(!r.contains("1234567890abcdef"), "{r}");
        assert!(redact("header Bearer sk-other-token used", "zzzz").contains("Bearer [key]"));
    }

    #[test]
    fn http_errors_are_classified() {
        assert_eq!(http_error(401, r#"{"error":{"message":"Invalid API-key provided.","code":"invalid_api_key"}}"#).code, "invalid_key");
        assert_eq!(http_error(429, r#"{"error":{"message":"Rate limit reached for requests"}}"#).code, "rate_limit");
        assert_eq!(http_error(429, r#"{"error":{"message":"You exceeded your current quota"}}"#).code, "quota");
        assert_eq!(http_error(404, "not found").code, "not_found");
        assert_eq!(http_error(503, "").code, "server");
    }

    #[test]
    fn sse_handles_split_chunks_and_utf8() {
        let mut p = SseParser::default();
        let line = "data: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\n\n".as_bytes();
        // Split inside the multi-byte character.
        let cut = line.iter().position(|&b| b >= 0x80).unwrap() + 1;
        assert!(p.push(&line[..cut]).is_empty());
        assert_eq!(p.push(&line[cut..]), vec![SseItem::Delta("你好".into())]);
        let tail = b"data: {\"choices\":[],\"usage\":{\"total_tokens\":42}}\n\ndata: [DONE]\n\n";
        assert_eq!(p.push(tail), vec![SseItem::Usage(42), SseItem::Done]);
        assert_eq!(p.push(b": keep-alive\n\n"), vec![]);
    }

    /// Serves one canned HTTP response on 127.0.0.1 and returns the request it saw.
    fn serve_once(response: String, delay_ms: u64) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}/v1", listener.local_addr().unwrap().port());
        let h = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            s.set_read_timeout(Some(Duration::from_millis(500))).unwrap();
            let mut req = Vec::new();
            let mut buf = [0u8; 8192];
            while let Ok(n) = s.read(&mut buf) {
                if n == 0 {
                    break;
                }
                req.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&req);
                if let Some(head_end) = text.find("\r\n\r\n") {
                    let len = text[..head_end]
                        .lines()
                        .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0)))
                        .unwrap_or(0);
                    if req.len() >= head_end + 4 + len {
                        break;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(delay_ms));
            let _ = s.write_all(response.as_bytes());
            let _ = s.flush();
            String::from_utf8_lossy(&req).into_owned()
        });
        (base, h)
    }

    fn sse_response(events: &[&str]) -> String {
        let body: String = events.iter().map(|e| format!("data: {e}\n\n")).collect();
        format!("HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len())
    }

    fn run(base: &str, timeout: Duration, cancel: Arc<Notify>) -> (Result<ChatOutcome, AiError>, Vec<String>) {
        let url = chat_endpoint(base).unwrap();
        let mut deltas = Vec::new();
        let r = tauri::async_runtime::block_on(run_chat(&url, "sk-test-secret-key", b"{\"model\":\"m\"}".to_vec(), timeout, cancel, |t| deltas.push(t)));
        (r, deltas)
    }

    #[test]
    fn streams_text_and_usage_from_a_local_server() {
        let (base, h) = serve_once(
            sse_response(&[
                r#"{"choices":[{"delta":{"content":"第一"}}]}"#,
                r#"{"choices":[{"delta":{"content":"段"}}]}"#,
                r#"{"choices":[],"usage":{"total_tokens":17}}"#,
                "[DONE]",
            ]),
            0,
        );
        let (r, deltas) = run(&base, Duration::from_secs(10), Arc::new(Notify::new()));
        let out = r.unwrap();
        assert_eq!(out.content, "第一段");
        assert_eq!(deltas, vec!["第一", "段"]);
        assert_eq!(out.tokens, Some(17));
        let req = h.join().unwrap();
        assert!(req.starts_with("POST /v1/chat/completions"), "{req}");
        assert!(req.to_lowercase().contains("authorization: bearer sk-test-secret-key"));
    }

    #[test]
    fn invalid_key_error_does_not_echo_the_key() {
        let body = r#"{"error":{"message":"Incorrect API key provided: sk-test-secret-key","code":"invalid_api_key"}}"#;
        let resp = format!("HTTP/1.1 401 Unauthorized\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
        let (base, _h) = serve_once(resp, 0);
        let (r, _) = run(&base, Duration::from_secs(10), Arc::new(Notify::new()));
        let e = r.unwrap_err().redacted("sk-test-secret-key");
        assert_eq!(e.code, "invalid_key");
        assert_eq!(e.status, Some(401));
        assert!(!e.message.contains("sk-test-secret-key"), "{}", e.message);
    }

    #[test]
    fn slow_servers_time_out() {
        let (base, _h) = serve_once(sse_response(&["[DONE]"]), 3000);
        let (r, _) = run(&base, Duration::from_millis(800), Arc::new(Notify::new()));
        assert_eq!(r.unwrap_err().code, "timeout");
    }

    #[test]
    fn requests_can_be_cancelled() {
        let (base, _h) = serve_once(sse_response(&["[DONE]"]), 3000);
        let cancel = Arc::new(Notify::new());
        cancel.notify_one(); // a stored permit: cancels as soon as the request waits
        let (r, _) = run(&base, Duration::from_secs(10), cancel);
        assert!(r.unwrap().cancelled);
    }

    #[test]
    fn unreachable_server_is_a_network_error() {
        // Bind and drop to get a port that nobody listens on.
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let (r, _) = run(&format!("http://127.0.0.1:{port}/v1"), Duration::from_secs(5), Arc::new(Notify::new()));
        assert_eq!(r.unwrap_err().code, "network");
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_round_trip() {
        let sealed = protect::protect(b"sk-secret").unwrap();
        assert!(!sealed.windows(9).any(|w| w == b"sk-secret"), "stored blob must not contain the key");
        assert_eq!(protect::unprotect(&sealed).unwrap(), b"sk-secret");
        let mut tampered = sealed.clone();
        let last = tampered.len() - 1;
        tampered[last] ^= 0xff;
        assert!(protect::unprotect(&tampered).is_err());
    }
}
