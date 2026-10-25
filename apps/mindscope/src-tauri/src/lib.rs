//! MindScope desktop shell (Tauri 2 + WebView2).
//!
//! Startup order matters for the "write nothing outside the app folder" rule:
//! 1. resolve the portable root and check it is writable;
//! 2. start file logging inside it;
//! 3. check that the WebView2 runtime exists;
//! 4. open SQLite;
//! 5. create the window with its WebView2 profile redirected to <root>/cache/webview2.

mod ai;
mod commands;
mod db;
mod logging;
mod native;
mod paths;
mod pdf;
mod storage;

use commands::AppState;
use std::path::PathBuf;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const TITLE: &str = "MindScope";

pub fn run() {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    let paths = paths::AppPaths::resolve(&exe_dir, std::env::var_os("MINDSCOPE_ROOT").map(PathBuf::from));

    if let Err(detail) = paths.ensure() {
        native::error_box(
            TITLE,
            &format!(
                "MindScope 无法在以下位置保存数据：\n{detail}\n\n请把 MindScope 文件夹移动到可写的位置（例如 D:\\MindScope 或 文档 文件夹）后重新打开。\n\nMindScope cannot write to this folder. Move the MindScope folder somewhere writable and try again."
            ),
        );
        std::process::exit(1);
    }

    let _log_guard = logging::init(&paths);
    tracing::info!(version = env!("CARGO_PKG_VERSION"), root = %paths.root.display(), relocated = paths.relocated, "starting");

    storage::apply_pending_cache_clear(&paths);

    match native::webview2_version() {
        Some(v) => tracing::info!(webview2 = %v, "webview2 runtime found"),
        None => {
            tracing::error!("webview2 runtime missing");
            // Opening the download page uses the network, so the user decides.
            if native::ask_yes_no(
                TITLE,
                "没有找到 Microsoft Edge WebView2 运行时，MindScope 需要它来显示界面。\nWindows 11 已自带此组件；Windows 10 可从微软官网免费安装。\n\n是否现在用浏览器打开微软官方下载页面？（需要联网）\n\nThe Microsoft Edge WebView2 Runtime is missing. Open the official download page now? (uses the network)",
            ) {
                native::open_url(native::WEBVIEW2_DOWNLOAD_URL);
            }
            std::process::exit(1);
        }
    }

    let db = match db::Db::open(&paths.db_file) {
        Ok(db) => db,
        Err(e) => {
            tracing::error!(error = %e, "cannot open database");
            native::error_box(TITLE, &format!("无法打开数据库 / Cannot open the database:\n{e}"));
            std::process::exit(1);
        }
    };

    let webview_dir = paths.webview.clone();
    let state = AppState {
        paths,
        db,
        smoke_pdf: std::env::var_os("MINDSCOPE_SMOKE_PDF").map(PathBuf::from),
        smoke_ai: std::env::var("MINDSCOPE_SMOKE_AI").ok(),
        exported: Default::default(),
        ai: Default::default(),
    };

    let result = tauri::Builder::default()
        // Must be the first plugin: a second launch focuses the running window instead
        // of opening the same database twice.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::db_query,
            commands::db_execute,
            commands::db_batch,
            commands::app_env,
            commands::log_message,
            commands::read_recent_logs,
            commands::storage_info,
            commands::open_folder,
            commands::clear_logs,
            commands::clear_cache,
            commands::backup_now,
            commands::list_backups,
            commands::restore_backup,
            commands::relocate_data_root,
            commands::export_pdf,
            commands::open_exported,
            ai::ai_key_status,
            ai::ai_key_save,
            ai::ai_key_clear,
            ai::ai_chat,
            ai::ai_cancel,
            commands::smoke_target,
            commands::smoke_ai_base,
            commands::print_pdf_to,
            commands::open_external,
            commands::restart_app,
            commands::exit_app,
        ])
        .setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title(TITLE)
                .inner_size(1240.0, 820.0)
                .min_inner_size(380.0, 560.0)
                .center()
                // The key line for "no files in C:\Users\…\AppData": WebView2 keeps its
                // profile, caches and crash data next to the app instead.
                .data_directory(webview_dir.clone())
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        tracing::error!(error = %e, "tauri failed");
        native::error_box(TITLE, &format!("MindScope 启动失败 / failed to start:\n{e}"));
    }
}
