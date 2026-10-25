//! File-system helpers for the "Data & storage" panel: sizes, backups,
//! log/cache cleanup and moving the data root.

use crate::db::Db;
use crate::paths::AppPaths;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const CACHE_CLEAR_MARKER: &str = ".clear-webview2-on-start";
/// Automatic backups (before migrations, deletes, restores) kept per kind.
const AUTO_BACKUPS_KEPT: usize = 10;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub bytes: u64,
    pub created_at: String,
}

/// Total bytes and file count below `dir` (missing dir = 0).
pub fn dir_size(dir: &Path) -> (u64, u64) {
    let mut bytes = 0;
    let mut files = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(entries) = fs::read_dir(&d) else { continue };
        for e in entries.flatten() {
            match e.metadata() {
                Ok(m) if m.is_dir() => stack.push(e.path()),
                Ok(m) => {
                    bytes += m.len();
                    files += 1;
                }
                Err(_) => {}
            }
        }
    }
    (bytes, files)
}

/// Deletes the contents of `dir`, skipping anything that is in use. Returns freed bytes.
pub fn empty_dir(dir: &Path, keep: impl Fn(&Path) -> bool) -> u64 {
    let mut freed = 0;
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    for e in entries.flatten() {
        let p = e.path();
        if keep(&p) {
            continue;
        }
        let size = if p.is_dir() { dir_size(&p).0 } else { e.metadata().map(|m| m.len()).unwrap_or(0) };
        let ok = if p.is_dir() { fs::remove_dir_all(&p).is_ok() } else { fs::remove_file(&p).is_ok() };
        if ok {
            freed += size;
        }
    }
    freed
}

/// The WebView2 profile is locked while the app runs, so its cleanup is deferred.
pub fn schedule_webview_cache_clear(paths: &AppPaths) -> Result<(), String> {
    fs::write(paths.cache.join(CACHE_CLEAR_MARKER), b"1").map_err(|e| e.to_string())
}

pub fn cache_clear_pending(paths: &AppPaths) -> bool {
    paths.cache.join(CACHE_CLEAR_MARKER).exists()
}

/// Called at startup, before the WebView exists.
pub fn apply_pending_cache_clear(paths: &AppPaths) {
    let marker = paths.cache.join(CACHE_CLEAR_MARKER);
    if marker.exists() {
        let freed = dir_size(&paths.webview).0;
        let _ = fs::remove_dir_all(&paths.webview);
        let _ = fs::create_dir_all(&paths.webview);
        let _ = fs::remove_file(marker);
        tracing::info!(freed, "webview cache cleared");
    }
}

fn sanitize(reason: &str) -> String {
    reason.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(40).collect()
}

fn iso(t: SystemTime) -> String {
    chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()
}

pub fn backup(db: &Db, paths: &AppPaths, reason: &str) -> Result<BackupInfo, String> {
    let reason = sanitize(reason);
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let name = if reason.is_empty() || reason == "manual" {
        format!("mindscope-{stamp}.db")
    } else {
        format!("mindscope-{stamp}-{reason}.db")
    };
    let dest = paths.backups.join(&name);
    db.backup_to(&dest)?;
    tracing::info!(%name, "backup written");
    if !(reason.is_empty() || reason == "manual") {
        prune_auto_backups(&paths.backups, &reason);
    }
    let bytes = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok(BackupInfo { name, bytes, created_at: iso(SystemTime::now()) })
}

fn prune_auto_backups(dir: &Path, reason: &str) {
    let suffix = format!("-{reason}.db");
    let mut list: Vec<PathBuf> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.ends_with(&suffix)))
        .collect();
    list.sort(); // names start with a timestamp
    while list.len() > AUTO_BACKUPS_KEPT {
        let _ = fs::remove_file(list.remove(0));
    }
}

pub fn list_backups(paths: &AppPaths) -> Vec<BackupInfo> {
    let mut list: Vec<BackupInfo> = fs::read_dir(&paths.backups)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.ends_with(".db") {
                return None;
            }
            let m = e.metadata().ok()?;
            Some(BackupInfo { name, bytes: m.len(), created_at: iso(m.modified().ok()?) })
        })
        .collect();
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    list
}

/// Only plain file names inside the backups folder are accepted.
pub fn backup_path(paths: &AppPaths, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.contains(['/', '\\', ':']) || name.contains("..") || !name.ends_with(".db") {
        return Err("invalid backup name".into());
    }
    let p = paths.backups.join(name);
    if !p.is_file() {
        return Err("backup not found".into());
    }
    Ok(p)
}

pub fn read_tail(paths: &AppPaths, max_lines: usize) -> String {
    let mut logs: Vec<PathBuf> = fs::read_dir(&paths.logs)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "log"))
        .collect();
    logs.sort();
    let Some(latest) = logs.last() else { return String::new() };
    let text = fs::read_to_string(latest).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(max_lines)..].join("\n")
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for e in fs::read_dir(src)?.flatten() {
        let target = dst.join(e.file_name());
        if e.file_type()?.is_dir() {
            copy_dir(&e.path(), &target)?;
        } else {
            fs::copy(e.path(), target)?;
        }
    }
    Ok(())
}

/// Copies all user data into `<chosen>/MindScopeData` and points the exe at it.
/// The old data stays where it was (the user can delete it after checking).
pub fn relocate(db: &Db, paths: &AppPaths, chosen: &Path) -> Result<PathBuf, String> {
    let new_root = chosen.join("MindScopeData");
    if new_root.starts_with(&paths.root) || paths.root.starts_with(&new_root) {
        return Err("The new folder must be outside the current data folder.".into());
    }
    let target = AppPaths::for_root(&paths.exe_dir, new_root.clone(), true);
    if target.db_file.exists() {
        return Err(format!("{} already contains MindScope data.", new_root.display()));
    }
    target.ensure()?;
    db.backup_to(&target.db_file)?;
    for (from, to) in [
        (&paths.avatars, &target.avatars),
        (&paths.question_bank, &target.question_bank),
        (&paths.exports, &target.exports),
        (&paths.backups, &target.backups),
    ] {
        copy_dir(from, to).map_err(|e| e.to_string())?;
    }
    crate::paths::write_pointer(&paths.exe_dir, &new_root)?;
    tracing::info!(to = %new_root.display(), "data root relocated");
    Ok(new_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_in_backup_names() {
        let dir = tempfile::tempdir().unwrap();
        let p = AppPaths::resolve(dir.path(), None);
        p.ensure().unwrap();
        for bad in ["../x.db", "..\\x.db", "C:x.db", "a/b.db", "x.txt", ""] {
            assert!(backup_path(&p, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn backup_list_and_prune() {
        let dir = tempfile::tempdir().unwrap();
        let p = AppPaths::resolve(dir.path(), None);
        p.ensure().unwrap();
        let db = Db::open(&p.db_file).unwrap();
        db.execute("CREATE TABLE t (x)", &[]).unwrap();
        let b = backup(&db, &p, "manual").unwrap();
        assert!(backup_path(&p, &b.name).is_ok());
        for i in 0..12 {
            std::fs::write(p.backups.join(format!("mindscope-2026010{i:02}-000000-pre-x.db")), b"x").unwrap();
        }
        prune_auto_backups(&p.backups, "pre-x");
        let autos = list_backups(&p).into_iter().filter(|b| b.name.ends_with("-pre-x.db")).count();
        assert_eq!(autos, AUTO_BACKUPS_KEPT);
    }

    #[test]
    fn relocate_copies_data_and_writes_pointer() {
        let exe = tempfile::tempdir().unwrap();
        let elsewhere = tempfile::tempdir().unwrap();
        let p = AppPaths::resolve(exe.path(), None);
        p.ensure().unwrap();
        let db = Db::open(&p.db_file).unwrap();
        db.execute("CREATE TABLE t (x)", &[]).unwrap();
        db.execute("INSERT INTO t VALUES (7)", &[]).unwrap();
        std::fs::write(p.avatars.join("a.png"), b"img").unwrap();

        let new_root = relocate(&db, &p, elsewhere.path()).unwrap();
        let moved = AppPaths::resolve(exe.path(), None);
        assert_eq!(moved.root, new_root);
        assert!(moved.avatars.join("a.png").exists());
        let db2 = Db::open(&moved.db_file).unwrap();
        assert_eq!(db2.query("SELECT x FROM t", &[]).unwrap()[0]["x"], serde_json::json!(7));
        // the original stays untouched
        assert!(p.db_file.exists());
    }

    #[test]
    fn empty_dir_respects_keep() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("keep.log"), b"12345").unwrap();
        std::fs::write(dir.path().join("old.log"), b"123").unwrap();
        let freed = empty_dir(dir.path(), |p| p.ends_with("keep.log"));
        assert_eq!(freed, 3);
        assert!(dir.path().join("keep.log").exists());
    }
}
