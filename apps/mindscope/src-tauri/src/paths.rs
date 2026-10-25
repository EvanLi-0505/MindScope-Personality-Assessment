//! Portable folder layout. Everything MindScope writes lives under one root
//! folder — by default the folder that contains MindScope.exe — so the app
//! never scatters files into %APPDATA%, %LOCALAPPDATA% or the registry.
//!
//! ```text
//! <root>/data/database/mindscope.db   all user data
//! <root>/data/{avatars,question_bank,exports,backups}
//! <root>/logs/                        daily log files
//! <root>/cache/webview2/              WebView2 profile (redirected from %LOCALAPPDATA%)
//! <root>/cache/tmp/
//! <root>/config/settings.json         settings needed before the UI starts
//! ```

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Written next to the exe only after the user moves the data folder.
pub const POINTER_FILE: &str = "mindscope.portable.json";

#[derive(Clone, Debug)]
pub struct AppPaths {
    pub exe_dir: PathBuf,
    pub root: PathBuf,
    pub relocated: bool,
    pub data: PathBuf,
    pub database_dir: PathBuf,
    pub db_file: PathBuf,
    pub avatars: PathBuf,
    pub question_bank: PathBuf,
    pub exports: PathBuf,
    pub backups: PathBuf,
    pub logs: PathBuf,
    pub cache: PathBuf,
    pub webview: PathBuf,
    pub tmp: PathBuf,
    pub config: PathBuf,
}

#[derive(Serialize, Deserialize)]
pub struct Pointer {
    #[serde(rename = "dataRoot")]
    pub data_root: String,
}

impl AppPaths {
    /// Root priority: `MINDSCOPE_ROOT` env var (dev/testing) → pointer file → exe folder.
    pub fn resolve(exe_dir: &Path, env_root: Option<PathBuf>) -> AppPaths {
        if let Some(root) = env_root {
            return Self::for_root(exe_dir, absolutize(exe_dir, &root), false);
        }
        if let Some(root) = read_pointer(exe_dir) {
            return Self::for_root(exe_dir, root, true);
        }
        Self::for_root(exe_dir, exe_dir.to_path_buf(), false)
    }

    pub fn for_root(exe_dir: &Path, root: PathBuf, relocated: bool) -> AppPaths {
        let data = root.join("data");
        let database_dir = data.join("database");
        let cache = root.join("cache");
        AppPaths {
            exe_dir: exe_dir.to_path_buf(),
            db_file: database_dir.join("mindscope.db"),
            avatars: data.join("avatars"),
            question_bank: data.join("question_bank").join("custom"),
            exports: data.join("exports"),
            backups: data.join("backups"),
            logs: root.join("logs"),
            webview: cache.join("webview2"),
            tmp: cache.join("tmp"),
            config: root.join("config"),
            database_dir,
            data,
            cache,
            root,
            relocated,
        }
    }

    pub fn all_dirs(&self) -> [&PathBuf; 10] {
        [
            &self.database_dir,
            &self.avatars,
            &self.question_bank,
            &self.exports,
            &self.backups,
            &self.logs,
            &self.webview,
            &self.tmp,
            &self.config,
            &self.data,
        ]
    }

    /// Creates missing folders and proves the root is writable.
    /// The error text is shown to the user, so it names the folder.
    pub fn ensure(&self) -> Result<(), String> {
        for dir in self.all_dirs() {
            fs::create_dir_all(dir).map_err(|e| format!("{}\n{}", dir.display(), e))?;
        }
        let probe = self.data.join(".write-test");
        fs::write(&probe, b"ok").map_err(|e| format!("{}\n{}", self.data.display(), e))?;
        let _ = fs::remove_file(probe);
        Ok(())
    }
}

fn absolutize(base: &Path, p: &Path) -> PathBuf {
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        base.join(p)
    }
}

fn read_pointer(exe_dir: &Path) -> Option<PathBuf> {
    let text = fs::read_to_string(exe_dir.join(POINTER_FILE)).ok()?;
    let pointer: Pointer = serde_json::from_str(&text).ok()?;
    if pointer.data_root.trim().is_empty() {
        return None;
    }
    Some(absolutize(exe_dir, Path::new(pointer.data_root.trim())))
}

pub fn write_pointer(exe_dir: &Path, new_root: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&Pointer { data_root: new_root.to_string_lossy().into_owned() })
        .map_err(|e| e.to_string())?;
    fs::write(exe_dir.join(POINTER_FILE), json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_exe_folder() {
        let dir = tempfile::tempdir().unwrap();
        let p = AppPaths::resolve(dir.path(), None);
        assert_eq!(p.root, dir.path());
        assert!(!p.relocated);
        assert_eq!(p.db_file, dir.path().join("data").join("database").join("mindscope.db"));
        assert_eq!(p.webview, dir.path().join("cache").join("webview2"));
    }

    #[test]
    fn follows_pointer_file_relative_or_absolute() {
        let exe = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        write_pointer(exe.path(), other.path()).unwrap();
        let p = AppPaths::resolve(exe.path(), None);
        assert_eq!(p.root, other.path());
        assert!(p.relocated);

        fs::write(exe.path().join(POINTER_FILE), r#"{"dataRoot":"sub"}"#).unwrap();
        assert_eq!(AppPaths::resolve(exe.path(), None).root, exe.path().join("sub"));
    }

    #[test]
    fn ignores_broken_pointer() {
        let exe = tempfile::tempdir().unwrap();
        fs::write(exe.path().join(POINTER_FILE), "not json").unwrap();
        assert_eq!(AppPaths::resolve(exe.path(), None).root, exe.path());
    }

    #[test]
    fn env_root_wins() {
        let exe = tempfile::tempdir().unwrap();
        let env = tempfile::tempdir().unwrap();
        write_pointer(exe.path(), Path::new("elsewhere")).unwrap();
        assert_eq!(AppPaths::resolve(exe.path(), Some(env.path().to_path_buf())).root, env.path());
    }

    #[test]
    fn ensure_creates_layout() {
        let dir = tempfile::tempdir().unwrap();
        let p = AppPaths::resolve(dir.path(), None);
        p.ensure().unwrap();
        for d in p.all_dirs() {
            assert!(d.is_dir(), "{}", d.display());
        }
        assert!(!p.data.join(".write-test").exists());
    }
}
