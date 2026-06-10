import { Database } from 'bun:sqlite';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS repos (
  did TEXT PRIMARY KEY,
  handle TEXT,
  display_name TEXT,
  fetched_at INTEGER NOT NULL,
  commit_cid TEXT
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_did TEXT NOT NULL,
  collection TEXT NOT NULL,
  rkey TEXT NOT NULL,
  created_at INTEGER,
  indexed_at INTEGER NOT NULL,
  subject_did TEXT,
  subject_uri TEXT,
  is_reply INTEGER,
  reply_parent_did TEXT,
  reply_root_did TEXT,
  text_length INTEGER,
  embed_type TEXT,
  raw_json TEXT,
  embedding BLOB,
  UNIQUE(repo_did, collection, rkey)
);

CREATE TABLE IF NOT EXISTS handle_cache (
  did TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  resolved_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cluster_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_did TEXT NOT NULL,
  k INTEGER NOT NULL,
  params_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clusters (
  run_id INTEGER NOT NULL REFERENCES cluster_runs(id),
  cluster_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  label_source TEXT NOT NULL,
  centroid BLOB NOT NULL,
  coherence REAL,
  color_index INTEGER,
  PRIMARY KEY (run_id, cluster_id)
);

CREATE TABLE IF NOT EXISTS cluster_assignments (
  run_id INTEGER NOT NULL,
  record_id INTEGER NOT NULL REFERENCES records(id),
  cluster_id INTEGER NOT NULL,
  similarity REAL NOT NULL,
  PRIMARY KEY (run_id, record_id)
);

CREATE INDEX IF NOT EXISTS idx_records_repo_collection ON records(repo_did, collection);
CREATE INDEX IF NOT EXISTS idx_cluster_runs_repo ON cluster_runs(repo_did, is_current);
CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);
CREATE INDEX IF NOT EXISTS idx_records_subject_did ON records(subject_did);
`;

export function initDatabase(path: string = 'bsky-viz.sqlite'): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(SCHEMA_SQL);
  return db;
}
