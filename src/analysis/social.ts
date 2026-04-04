import { Database } from 'bun:sqlite';
import type { SocialEvent } from '../types.js';

// Follow timeline: all follow events ordered by time
export function getFollowTimeline(db: Database, did: string, start?: number, end?: number): SocialEvent[] {
  let where = "WHERE repo_did = ? AND collection = 'app.bsky.graph.follow' AND created_at IS NOT NULL";
  const params: any[] = [did];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }
  const sql = `SELECT created_at, collection, subject_did
    FROM records
    ${where}
    ORDER BY created_at`;
  return db.query(sql).all(...params) as SocialEvent[];
}

// Block timeline: all block events ordered by time
export function getBlockTimeline(db: Database, did: string, start?: number, end?: number): SocialEvent[] {
  let where = "WHERE repo_did = ? AND collection = 'app.bsky.graph.block' AND created_at IS NOT NULL";
  const params: any[] = [did];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }
  const sql = `SELECT created_at, collection, subject_did
    FROM records
    ${where}
    ORDER BY created_at`;
  return db.query(sql).all(...params) as SocialEvent[];
}
