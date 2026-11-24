use crate::error::AppResult;
use crate::scene::BeatSummary;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Arc;

#[derive(Clone)]
pub struct SqliteStore {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteStore {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        Self::from_connection(conn)
    }

    pub fn in_memory() -> AppResult<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> AppResult<Self> {
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                started_at_ms INTEGER NOT NULL,
                ended_at_ms INTEGER,
                theme TEXT NOT NULL,
                snapshot_json TEXT
            );
            CREATE TABLE IF NOT EXISTS utterances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                utterance_id TEXT NOT NULL,
                text TEXT NOT NULL,
                is_final INTEGER NOT NULL,
                created_at_ms INTEGER NOT NULL,
                latency_ms INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS beats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                label TEXT NOT NULL,
                created_at_ms INTEGER NOT NULL,
                snapshot_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_utterances_session ON utterances(session_id);
            CREATE INDEX IF NOT EXISTS idx_beats_session ON beats(session_id);
            "#,
        )?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn create_session(&self, id: &str, title: &str, theme: &str) -> AppResult<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, title, started_at_ms, theme) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, crate::now_ms(), theme],
        )?;
        Ok(())
    }

    pub fn end_session(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE sessions SET ended_at_ms = ?2 WHERE id = ?1",
            params![id, crate::now_ms()],
        )?;
        Ok(())
    }

    pub fn update_snapshot(&self, id: &str, snapshot: &str) -> AppResult<()> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE sessions SET snapshot_json = ?2 WHERE id = ?1",
            params![id, snapshot],
        )?;
        Ok(())
    }

    pub fn record_utterance(
        &self,
        session_id: &str,
        utterance_id: &str,
        text: &str,
        is_final: bool,
        latency_ms: u32,
    ) -> AppResult<()> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO utterances (session_id, utterance_id, text, is_final, created_at_ms, latency_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![session_id, utterance_id, text, is_final as i32, crate::now_ms(), latency_ms],
        )?;
        Ok(())
    }

    pub fn save_beat(&self, session_id: &str, label: &str, snapshot: &str) -> AppResult<i64> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO beats (session_id, label, created_at_ms, snapshot_json) VALUES (?1, ?2, ?3, ?4)",
            params![session_id, label, crate::now_ms(), snapshot],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_beats(&self, session_id: &str) -> AppResult<Vec<BeatSummary>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, label, created_at_ms FROM beats WHERE session_id = ?1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            Ok(BeatSummary {
                id: row.get(0)?,
                session_id: row.get(1)?,
                label: row.get(2)?,
                created_at_ms: row.get(3)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn restore_beat(&self, beat_id: i64) -> AppResult<Option<String>> {
        let conn = self.conn.lock();
        let snapshot = conn
            .query_row(
                "SELECT snapshot_json FROM beats WHERE id = ?1",
                params![beat_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        Ok(snapshot)
    }

    pub fn list_beats_with_snapshots(&self, session_id: &str) -> AppResult<Vec<(String, String)>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT label, snapshot_json FROM beats WHERE session_id = ?1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn list_utterances(&self, session_id: &str) -> AppResult<Vec<(String, i64)>> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT text, created_at_ms FROM utterances WHERE session_id = ?1 AND is_final = 1 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn session_title(&self, session_id: &str) -> AppResult<Option<String>> {
        let conn = self.conn.lock();
        Ok(conn
            .query_row(
                "SELECT title FROM sessions WHERE id = ?1",
                params![session_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_and_restores_beats() {
        let store = SqliteStore::in_memory().unwrap();
        store.create_session("s1", "Aula", "3b1b").unwrap();
        let id = store.save_beat("s1", "Primeiro", "{\"nodes\":{}}").unwrap();
        let beats = store.list_beats("s1").unwrap();
        assert_eq!(beats.len(), 1);
        assert_eq!(beats[0].id, id);
        assert_eq!(store.restore_beat(id).unwrap().as_deref(), Some("{\"nodes\":{}}"));
    }

    #[test]
    fn records_utterances() {
        let store = SqliteStore::in_memory().unwrap();
        store.create_session("s1", "Aula", "ted").unwrap();
        store.record_utterance("s1", "u_1", "olá", true, 42).unwrap();
        store.end_session("s1").unwrap();
        assert_eq!(store.session_title("s1").unwrap().as_deref(), Some("Aula"));
    }
}
