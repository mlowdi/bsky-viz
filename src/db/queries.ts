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

export function getRecordCount(db: Database, did: string, start?: number, end?: number): Record<string, number> {
  let where = 'WHERE repo_did = ?';
  const params: any[] = [did];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }

  const rows = db.query(
    `SELECT collection, COUNT(*) as count FROM records ${where} GROUP BY collection`
  ).all(...params) as { collection: string; count: number }[];
  return Object.fromEntries(rows.map(r => [r.collection, r.count]));
}

export function getCachedHandle(db: Database, did: string): string | null {
  const row = db.query('SELECT handle FROM handle_cache WHERE did = ?').get(did) as { handle: string } | null;
  return row?.handle ?? null;
}

export function getCachedHandles(db: Database, dids: string[]): Record<string, string> {
  if (dids.length === 0) return {};
  const placeholders = dids.map(() => '?').join(',');
  const rows = db.query(`SELECT did, handle FROM handle_cache WHERE did IN (${placeholders})`).all(...dids) as { did: string; handle: string }[];
  return Object.fromEntries(rows.map(r => [r.did, r.handle]));
}

export function cacheHandle(db: Database, did: string, handle: string): void {
  db.run(
    'INSERT OR REPLACE INTO handle_cache (did, handle, resolved_at) VALUES (?, ?, ?)',
    [did, handle, Date.now()]
  );
}

export function updateEmbedding(db: Database, id: number, embedding: Buffer): void {
  db.run('UPDATE records SET embedding = ? WHERE id = ?', [embedding, id]);
}

export function getEmbeddingStatus(db: Database, did: string): { totalPosts: number; embeddedPosts: number } {
  const row = db.query(
    `SELECT
       COUNT(*) as totalPosts,
       COUNT(embedding) as embeddedPosts
     FROM records
     WHERE repo_did = ? AND collection = 'app.bsky.feed.post'`
  ).get(did) as { totalPosts: number; embeddedPosts: number };
  return row;
}

export function getPostsWithoutEmbeddings(db: Database, did: string): { id: number; raw_json: string }[] {
  return db.query(
    "SELECT id, raw_json FROM records WHERE repo_did = ? AND collection = 'app.bsky.feed.post' AND embedding IS NULL AND raw_json IS NOT NULL"
  ).all(did) as { id: number; raw_json: string }[];
}

export function getOutlierRecords(db: Database, did: string): { text: string; createdAt: number; collection: string }[] {
  const BLUESKY_EPOCH_MS = 1672531200 * 1000;
  const sql = `
    SELECT raw_json, created_at, collection
    FROM records
    WHERE repo_did = ? AND created_at < ? AND raw_json IS NOT NULL
  `;
  const rows = db.query(sql).all(did, BLUESKY_EPOCH_MS) as { raw_json: string; created_at: number; collection: string }[];
  
  const outliers: { text: string; createdAt: number; collection: string }[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.raw_json);
      if (parsed.text) {
        outliers.push({
          text: parsed.text,
          createdAt: row.created_at,
          collection: row.collection
        });
      }
    } catch (e) {
      // skip
    }
  }
  return outliers;
}
