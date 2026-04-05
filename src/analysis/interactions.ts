import { Database } from 'bun:sqlite';
import type { InteractionPartner, RatioData } from '../types.js';
import { BLUESKY_EPOCH } from '../constants.js';

// Top interaction partners: for likes, reposts, and replies
// Group by subject_did (for likes/reposts) or reply_parent_did (for posts that are replies)
// Return top N per interaction type
export function getTopInteractions(
  db: Database, did: string, limit: number = 20, start?: number, end?: number
): InteractionPartner[] {
  let timeFilter = ' AND created_at >= ?';
  const timeParams: any[] = [BLUESKY_EPOCH * 1000];
  if (start !== undefined) {
    timeFilter += ' AND created_at >= ?';
    timeParams.push(start * 1000);
  }
  if (end !== undefined) {
    timeFilter += ' AND created_at <= ?';
    timeParams.push(end * 1000);
  }

  // Union of:
  // 1. Likes: subject_did from collection='app.bsky.feed.like'
  // 2. Reposts: subject_did from collection='app.bsky.feed.repost'
  // 3. Replies: reply_parent_did from collection='app.bsky.feed.post' WHERE is_reply=1
  const sql = `
    WITH interactions AS (
      SELECT subject_did as did, 'app.bsky.feed.like' as collection, COUNT(*) as count
      FROM records WHERE repo_did = ? AND collection = 'app.bsky.feed.like' AND subject_did IS NOT NULL AND subject_did != ? ${timeFilter}
      GROUP BY subject_did
      UNION ALL
      SELECT subject_did as did, 'app.bsky.feed.repost' as collection, COUNT(*) as count
      FROM records WHERE repo_did = ? AND collection = 'app.bsky.feed.repost' AND subject_did IS NOT NULL AND subject_did != ? ${timeFilter}
      GROUP BY subject_did
      UNION ALL
      SELECT reply_parent_did as did, 'reply' as collection, COUNT(*) as count
      FROM records WHERE repo_did = ? AND collection = 'app.bsky.feed.post' AND is_reply = 1 AND reply_parent_did IS NOT NULL AND reply_parent_did != ? ${timeFilter}
      GROUP BY reply_parent_did
    )
    SELECT i.did, i.collection, i.count
    FROM interactions i
    JOIN (
      SELECT did, SUM(count) as total_interactions
      FROM interactions
      GROUP BY did
      ORDER BY total_interactions DESC
      LIMIT ?
    ) top ON top.did = i.did`;
  
  const params = [
    did, did, ...timeParams,
    did, did, ...timeParams,
    did, did, ...timeParams,
    limit
  ];
  return db.query(sql).all(...params) as InteractionPartner[];
}

// Content ratios: count of posts vs replies vs reposts vs likes
export function getContentRatios(db: Database, did: string, start?: number, end?: number): RatioData[] {
  let where = "WHERE repo_did = ? AND created_at >= ? AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list')";
  const params: any[] = [did, BLUESKY_EPOCH * 1000];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }

  const sql = `SELECT
    CASE
      WHEN collection = 'app.bsky.feed.post' AND is_reply = 1 THEN 'reply'
      WHEN collection = 'app.bsky.feed.post' AND (is_reply = 0 OR is_reply IS NULL) THEN 'original_post'
      ELSE collection
    END as collection,
    COUNT(*) as count
    FROM records
    ${where}
    GROUP BY 1
    ORDER BY count DESC`;
  return db.query(sql).all(...params) as RatioData[];
}
