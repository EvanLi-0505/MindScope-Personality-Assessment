//! Daily log files in <root>/logs. Logs hold events and errors only — the
//! frontend never sends answers, profile details or API keys here.

use crate::paths::AppPaths;
use serde::{Deserialize, Serialize};
use std::fs;
use tracing::Level;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootConfig {
    pub log_level: String,
    pub log_retention_days: usize,
}

impl Default for BootConfig {
    fn default() -> Self {
        BootConfig { log_level: "info".into(), log_retention_days: 14 }
    }
}

/// `config/settings.json` — read before the UI exists, created with defaults.
pub fn load_config(paths: &AppPaths) -> BootConfig {
    let file = paths.config.join("settings.json");
    match fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str(&t).ok()) {
        Some(cfg) => cfg,
        None => {
            let cfg = BootConfig::default();
            if let Ok(json) = serde_json::to_string_pretty(&cfg) {
                let _ = fs::write(&file, json);
            }
            cfg
        }
    }
}

pub fn init(paths: &AppPaths) -> Option<WorkerGuard> {
    let cfg = load_config(paths);
    let level = match cfg.log_level.to_ascii_lowercase().as_str() {
        "debug" => Level::DEBUG,
        "warn" => Level::WARN,
        "error" => Level::ERROR,
        _ => Level::INFO,
    };
    let appender = RollingFileAppender::builder()
        .rotation(Rotation::DAILY)
        .filename_prefix("mindscope")
        .filename_suffix("log")
        .max_log_files(cfg.log_retention_days.max(1))
        .build(&paths.logs)
        .ok()?;
    let (writer, guard) = tracing_appender::non_blocking(appender);
    tracing_subscriber::fmt()
        .with_writer(writer)
        .with_ansi(false)
        .with_max_level(level)
        .with_target(true)
        .try_init()
        .ok()?;
    Some(guard)
}

/// File name of the log currently being written (tracing-appender rotates on UTC dates).
pub fn active_log_name() -> String {
    format!("mindscope.{}.log", chrono::Utc::now().format("%Y-%m-%d"))
}
