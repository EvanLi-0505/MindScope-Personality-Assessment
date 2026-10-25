//! Commands the frontend can call (see apps/mindscope/src/platform/desktop).
//! None of them reaches the network except `open_external`, which only hands
//! a URL to the system browser after the user confirmed it in the UI, and the
//! optional AI commands in `ai.rs`.

use crate::db::{Db, Statement};
use crate::paths::AppPaths;
use crate::{logging, native, pdf, storage};
use serde::Serialize;
use serde_json::{Map, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    pub paths: AppPaths,
    pub db: Db,
    /// Set by MINDSCOPE_SMOKE_PDF for the automated smoke test.
    pub smoke_pdf: Option<PathBuf>,
    /// Smoke test only (MINDSCOPE_SMOKE_AI): address of a local mock AI server.
    pub smoke_ai: Option<String>,
    /// PDFs written by this run; only these can be opened or revealed.
    pub exported: Mutex<Vec<PathBuf>>,
    pub ai: crate::ai::AiState,
}

type CmdResult<T> = Result<T, String>;

// ── database ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn db_query(state: State<'_, AppState>, sql: String, params: Vec<Value>) -> CmdResult<Vec<Map<String, Value>>> {
    state.db.query(&sql, &params)
}

#[derive(Serialize)]
pub struct Changes {
    changes: usize,
}

#[tauri::command]
pub fn db_execute(state: State<'_, AppState>, sql: String, params: Vec<Value>) -> CmdResult<Changes> {
    Ok(Changes { changes: state.db.execute(&sql, &params)? })
}

#[tauri::command]
pub fn db_batch(state: State<'_, AppState>, statements: Vec<Statement>) -> CmdResult<()> {
    state.db.batch(&statements)
}

// ── environment & logs ──────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvInfo {
    platform: &'static str,
    app_version: &'static str,
    engine: String,
    os: String,
}

#[tauri::command]
pub fn app_env() -> EnvInfo {
    EnvInfo {
        platform: "desktop",
        app_version: env!("CARGO_PKG_VERSION"),
        engine: format!("SQLite {}", rusqlite::version()),
        os: format!(
            "{} {} · WebView2 {}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            native::webview2_version().unwrap_or_else(|| "?".into())
        ),
    }
}

#[tauri::command]
pub fn log_message(level: String, message: String) {
    let message: String = message.chars().take(2000).collect();
    match level.as_str() {
        "error" => tracing::error!(target: "frontend", "{message}"),
        "warn" => tracing::warn!(target: "frontend", "{message}"),
        "debug" => tracing::debug!(target: "frontend", "{message}"),
        _ => tracing::info!(target: "frontend", "{message}"),
    }
}

#[tauri::command]
pub fn read_recent_logs(state: State<'_, AppState>, max_lines: usize) -> String {
    storage::read_tail(&state.paths, max_lines.min(2000))
}

// ── storage panel ───────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    kind: &'static str,
    path: String,
    bytes: u64,
    files: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    root: String,
    relocated: bool,
    locations: Vec<Location>,
    database_bytes: u64,
    durable: bool,
    cache_clear_pending: bool,
}

#[tauri::command]
pub fn storage_info(state: State<'_, AppState>) -> StorageInfo {
    let p = &state.paths;
    let loc = |kind, dir: &PathBuf| {
        let (bytes, files) = storage::dir_size(dir);
        Location { kind, path: dir.display().to_string(), bytes, files }
    };
    StorageInfo {
        root: p.root.display().to_string(),
        relocated: p.relocated,
        locations: vec![loc("data", &p.data), loc("logs", &p.logs), loc("cache", &p.cache)],
        database_bytes: state.db.file_bytes(),
        durable: true,
        cache_clear_pending: storage::cache_clear_pending(p),
    }
}

#[tauri::command]
pub fn open_folder(app: AppHandle, state: State<'_, AppState>, kind: String) -> CmdResult<()> {
    let p = &state.paths;
    let dir = match kind.as_str() {
        "data" => &p.data,
        "logs" => &p.logs,
        "cache" => &p.cache,
        "backups" => &p.backups,
        "exports" => &p.exports,
        _ => return Err("unknown folder".into()),
    };
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Freed {
    freed_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pending_restart: Option<bool>,
}

#[tauri::command]
pub fn clear_logs(state: State<'_, AppState>) -> Freed {
    let active = logging::active_log_name();
    let freed = storage::empty_dir(&state.paths.logs, |p| p.file_name().is_some_and(|n| n == active.as_str()));
    tracing::info!(freed, "logs cleared");
    Freed { freed_bytes: freed, pending_restart: None }
}

#[tauri::command]
pub fn clear_cache(state: State<'_, AppState>) -> CmdResult<Freed> {
    let freed = storage::empty_dir(&state.paths.tmp, |_| false);
    storage::schedule_webview_cache_clear(&state.paths)?;
    tracing::info!(freed, "cache cleared; webview cache scheduled");
    Ok(Freed { freed_bytes: freed, pending_restart: Some(true) })
}

#[tauri::command]
pub fn backup_now(state: State<'_, AppState>, reason: Option<String>) -> CmdResult<storage::BackupInfo> {
    storage::backup(&state.db, &state.paths, reason.as_deref().unwrap_or("manual"))
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> Vec<storage::BackupInfo> {
    storage::list_backups(&state.paths)
}

#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, name: String) -> CmdResult<()> {
    let src = storage::backup_path(&state.paths, &name)?;
    storage::backup(&state.db, &state.paths, "before-restore")?;
    state.db.restore_from(&src)?;
    tracing::info!(%name, "restored from backup");
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Relocated {
    new_root: String,
}

#[tauri::command]
pub async fn relocate_data_root(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Option<Relocated>> {
    let Some(folder) = app.dialog().file().blocking_pick_folder() else { return Ok(None) };
    let chosen = folder.into_path().map_err(|e| e.to_string())?;
    let new_root = storage::relocate(&state.db, &state.paths, &chosen)?;
    Ok(Some(Relocated { new_root: new_root.display().to_string() }))
}

// ── PDF ─────────────────────────────────────────────────────────────────

fn clean_file_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { '_' } else { c }).collect();
    if cleaned.to_ascii_lowercase().ends_with(".pdf") {
        cleaned
    } else {
        format!("{cleaned}.pdf")
    }
}

/// Asks where to save (the Windows dialog itself confirms overwriting), then prints.
#[tauri::command]
pub async fn export_pdf(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, AppState>,
    suggested_name: String,
) -> CmdResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_directory(&state.paths.exports)
        .set_file_name(clean_file_name(&suggested_name))
        .add_filter("PDF", &["pdf"])
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let mut path = picked.into_path().map_err(|e| e.to_string())?;
    if path.extension().is_none_or(|e| !e.eq_ignore_ascii_case("pdf")) {
        path.set_extension("pdf");
    }
    pdf::print_to_pdf(&window, path.clone()).await?;
    tracing::info!("pdf exported");
    state.exported.lock().map_err(|e| e.to_string())?.push(path.clone());
    Ok(Some(path.display().to_string()))
}

/// Opens a PDF this run exported, or shows it in Explorer. Any other path is refused,
/// so the frontend cannot use this to launch arbitrary files.
#[tauri::command]
pub fn open_exported(app: AppHandle, state: State<'_, AppState>, path: String, reveal: bool) -> CmdResult<()> {
    let path = PathBuf::from(path);
    let known = state.exported.lock().map_err(|e| e.to_string())?.contains(&path);
    if !known || !is_pdf(&path) || !path.is_file() {
        return Err("file not available".into());
    }
    if reveal {
        app.opener().reveal_item_in_dir(&path).map_err(|e| e.to_string())
    } else {
        app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
    }
}

fn is_pdf(path: &std::path::Path) -> bool {
    path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
}

#[tauri::command]
pub fn smoke_ai_base(state: State<'_, AppState>) -> Option<String> {
    state.smoke_pdf.as_ref().and(state.smoke_ai.clone())
}

#[tauri::command]
pub fn smoke_target(state: State<'_, AppState>) -> Option<String> {
    state.smoke_pdf.as_ref().map(|p| p.display().to_string())
}

/// Smoke test only: prints to the path given by MINDSCOPE_SMOKE_PDF, or to
/// `<its stem>-<name>.pdf` next to it. Nothing else.
#[tauri::command]
pub async fn print_pdf_to(window: WebviewWindow, state: State<'_, AppState>, path: String) -> CmdResult<()> {
    let allowed = state.smoke_pdf.clone().ok_or("not in smoke mode")?;
    let path = PathBuf::from(path);
    if !smoke_path_allowed(&allowed, &path) {
        return Err("path not allowed".into());
    }
    pdf::print_to_pdf(&window, path).await
}

fn smoke_path_allowed(allowed: &std::path::Path, path: &std::path::Path) -> bool {
    if path == allowed {
        return true;
    }
    let (Some(stem), Some(name)) = (allowed.file_stem(), path.file_name()) else { return false };
    let (stem, name) = (stem.to_string_lossy(), name.to_string_lossy());
    let suffix = name.strip_prefix(&format!("{stem}-")).and_then(|n| n.strip_suffix(".pdf")).unwrap_or("");
    path.parent() == allowed.parent() && !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_alphanumeric())
}

// ── app lifecycle & links ───────────────────────────────────────────────

#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only web links can be opened".into());
    }
    tracing::info!(%url, "opening external link (user confirmed)");
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::{clean_file_name, is_pdf, smoke_path_allowed};
    use std::path::Path;

    #[test]
    fn file_names_are_sanitized() {
        assert_eq!(clean_file_name("报告:张三/2026"), "报告_张三_2026.pdf");
        assert_eq!(clean_file_name("a.PDF"), "a.PDF");
    }

    #[test]
    fn only_pdfs_can_be_opened() {
        assert!(is_pdf(Path::new("D:/x/report.pdf")));
        assert!(is_pdf(Path::new("D:/x/report.PDF")));
        assert!(!is_pdf(Path::new("D:/x/report.pdf.exe")));
        assert!(!is_pdf(Path::new("D:/x/report")));
    }

    #[test]
    fn smoke_prints_only_next_to_the_given_file() {
        let base = Path::new("D:/t/smoke.pdf");
        assert!(smoke_path_allowed(base, base));
        assert!(smoke_path_allowed(base, Path::new("D:/t/smoke-mbti.pdf")));
        assert!(!smoke_path_allowed(base, Path::new("D:/other/smoke-mbti.pdf")));
        assert!(!smoke_path_allowed(base, Path::new("D:/t/smoke-../x.pdf")));
        assert!(!smoke_path_allowed(base, Path::new("D:/t/smoke-.pdf")));
        assert!(!smoke_path_allowed(base, Path::new("D:/t/smoke-a.exe")));
    }
}
