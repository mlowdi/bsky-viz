import { Database } from 'bun:sqlite';
import type { RepoRow, RecordRow } from '../types.js';

export function upsertRepo(db: Database, repo: RepoRow): void {
  db.run(
    `INSERT INTO repos (did, handle, display_name, fetched_at, commit_cid)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(did) DO UPDATE SET
       handle = ?2, display_name = ?3, fetched_at = ?4, commit_cid = ?5`,
    [repo.did, repo.handle, repo.display_name, repo.fetched_at, repo.commit_cid]
  );
}

export function insertRecordBatch(db: Database, records: RecordRow[]): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO records
     (repo_did, collection, rkey, created_at, indexed_at, subject_did, subject_uri,
      is_reply, reply_parent_did, reply_root_did, text_length, embed_type, raw_json, embedding)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
  );
  const tx = db.transaction((rows: RecordRow[]) => {
    for (const r of rows) {
      stmt.run(
        r.repo_did, r.collection, r.rkey, r.created_at, r.indexed_at,
        r.subject_did, r.subject_uri, r.is_reply, r.reply_parent_did,
        r.reply_root_did, r.text_length, r.embed_type, r.raw_json, r.embedding
      );
    }
  });
  tx(records);
}

export function getRepos(db: Database): RepoRow[] {
  return db.query('SELECT * FROM repos').all() as RepoRow[];
}

export function getRepo(db: Database, did: string): RepoRow | null {
  return db.query('SELECT * FROM repos WHERE did = ?').get(did) as RepoRow | null;
}

export function getRecordCount(db: Database, did: string): Record<string, number> {
  const rows = db.query(
    'SELECT collection, COUNT(*) as count FROM records WHERE repo_did = ? GROUP BY collection'
  ).all(did) as { collection: string; count: number }[];
  return Object.fromEntries(rows.map(r => [r.collection, r.count]));
}
