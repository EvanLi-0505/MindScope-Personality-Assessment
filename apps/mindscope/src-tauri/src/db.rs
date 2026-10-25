//! SQLite access for the frontend. The schema and all SQL live in the shared
//! TypeScript package `@mindscope/storage`; this module only executes
//! statements, so web and desktop run exactly the same queries.

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, MAIN_DB};
use serde::Deserialize;
use serde_json::{Map, Number, Value};
use std::path::Path;
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
}

#[derive(Deserialize)]
pub struct Statement {
    pub sql: String,
    /// `None` = run as a script (may contain several statements).
    pub params: Option<Vec<Value>>,
}

const PRAGMAS: &str = "PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;";

fn to_sql(v: &Value) -> Result<SqlValue, String> {
    Ok(match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or("invalid number")?),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Array(_) | Value::Object(_) => return Err("SQL parameters must be scalars".into()),
    })
}

fn to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        // Binary data is never stored by MindScope; expose its size instead of failing.
        ValueRef::Blob(b) => Value::String(format!("<blob {} bytes>", b.len())),
    }
}

fn convert(params: &[Value]) -> Result<Vec<SqlValue>, String> {
    params.iter().map(to_sql).collect()
}

impl Db {
    pub fn open(path: &Path) -> Result<Db, String> {
        let conn = Connection::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
        conn.execute_batch(PRAGMAS).map_err(|e| e.to_string())?;
        Ok(Db { conn: Mutex::new(conn) })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Db {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(PRAGMAS).unwrap();
        Db { conn: Mutex::new(conn) }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        // A panic while holding the lock must not brick the database for the session.
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    pub fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
        let conn = self.lock();
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut rows = stmt.query(params_from_iter(convert(params)?)).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let mut obj = Map::with_capacity(names.len());
            for (i, name) in names.iter().enumerate() {
                obj.insert(name.clone(), to_json(row.get_ref(i).map_err(|e| e.to_string())?));
            }
            out.push(obj);
        }
        Ok(out)
    }

    pub fn execute(&self, sql: &str, params: &[Value]) -> Result<usize, String> {
        let conn = self.lock();
        conn.execute(sql, params_from_iter(convert(params)?)).map_err(|e| e.to_string())
    }

    /// All statements in one transaction; any error rolls everything back.
    pub fn batch(&self, statements: &[Statement]) -> Result<(), String> {
        let mut conn = self.lock();
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        for s in statements {
            match &s.params {
                None => tx.execute_batch(&s.sql),
                Some(p) => tx.execute(&s.sql, params_from_iter(convert(p)?)).map(|_| ()),
            }
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// Consistent online copy (safe while the app is running, includes WAL content).
    pub fn backup_to(&self, dest: &Path) -> Result<(), String> {
        self.lock().backup(MAIN_DB, dest, None).map_err(|e| e.to_string())
    }

    /// Replaces the live database with the content of `src`.
    pub fn restore_from(&self, src: &Path) -> Result<(), String> {
        let mut conn = self.lock();
        conn.restore(MAIN_DB, src, None::<fn(rusqlite::backup::Progress)>)
            .map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())
    }

    pub fn file_bytes(&self) -> u64 {
        self.query("SELECT page_count * page_size AS b FROM pragma_page_count(), pragma_page_size()", &[])
            .ok()
            .and_then(|r| r.first().and_then(|m| m.get("b")).and_then(|v| v.as_u64()))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> Db {
        let db = Db::open_in_memory();
        db.batch(&[Statement {
            sql: "CREATE TABLE p (id TEXT PRIMARY KEY, n INTEGER, r REAL, flag INTEGER);
                  CREATE TABLE c (pid TEXT REFERENCES p(id) ON DELETE CASCADE);"
                .into(),
            params: None,
        }])
        .unwrap();
        db
    }

    #[test]
    fn round_trips_json_values() {
        let db = setup();
        db.execute("INSERT INTO p VALUES (?, ?, ?, ?)", &[json!("a"), json!(42), json!(1.5), json!(true)])
            .unwrap();
        let rows = db.query("SELECT * FROM p", &[]).unwrap();
        assert_eq!(rows[0]["id"], json!("a"));
        assert_eq!(rows[0]["n"], json!(42));
        assert_eq!(rows[0]["r"], json!(1.5));
        assert_eq!(rows[0]["flag"], json!(1));
    }

    #[test]
    fn rejects_non_scalar_params() {
        let db = setup();
        assert!(db.execute("INSERT INTO p (id) VALUES (?)", &[json!([1, 2])]).is_err());
    }

    #[test]
    fn batch_is_atomic() {
        let db = setup();
        let r = db.batch(&[
            Statement { sql: "INSERT INTO p (id) VALUES (?)".into(), params: Some(vec![json!("x")]) },
            Statement { sql: "INSERT INTO p (id) VALUES (?)".into(), params: Some(vec![json!("x")]) },
        ]);
        assert!(r.is_err());
        assert!(db.query("SELECT * FROM p", &[]).unwrap().is_empty());
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let db = setup();
        assert!(db.execute("INSERT INTO c VALUES ('missing')", &[]).is_err());
    }

    #[test]
    fn backup_and_restore() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("live.db");
        let db = Db::open(&file).unwrap();
        db.execute("CREATE TABLE t (v TEXT)", &[]).unwrap();
        db.execute("INSERT INTO t VALUES ('before')", &[]).unwrap();
        let snap = dir.path().join("snap.db");
        db.backup_to(&snap).unwrap();
        db.execute("UPDATE t SET v = 'after'", &[]).unwrap();
        db.restore_from(&snap).unwrap();
        assert_eq!(db.query("SELECT v FROM t", &[]).unwrap()[0]["v"], json!("before"));
    }
}
