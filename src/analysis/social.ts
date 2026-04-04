import { Database } from 'bun:sqlite';
import type { SocialEvent } from '../types.js';

// Follow timeline: all follow events ordered by time
export function getFollowTimeline(db: Database, did: string): SocialEvent[] {
  const sql = `SELECT created_at, collection, subject_did
    FROM records
    WHERE repo_did = ? AND collection = 'app.bsky.graph.follow' AND created_at IS NOT NULL
    ORDER BY created_at`;
  return db.query(sql).all(did) as SocialEvent[];
}

// Block timeline: all block events ordered by time
export function getBlockTimeline(db: Database, did: string): SocialEvent[] {
  const sql = `SELECT created_at, collection, subject_did
    FROM records
    WHERE repo_did = ? AND collection = 'app.bsky.graph.block' AND created_at IS NOT NULL
    ORDER BY created_at`;
  return db.query(sql).all(did) as SocialEvent[];
}
