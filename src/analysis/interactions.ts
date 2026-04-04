import { Database } from 'bun:sqlite';
import type { InteractionPartner, RatioData } from '../types.js';

// Top interaction partners: for likes, reposts, and replies
// Group by subject_did (for likes/reposts) or reply_parent_did (for posts that are replies)
// Return top N per interaction type
export function getTopInteractions(
  db: Database, did: string, limit: number = 20, start?: number, end?: number
): InteractionPartner[] {
  let timeFilter = '';
  const timeParams: any[] = [];
  if (start !== undefined) {
    timeFilter += ' AND created_at >= ?';
    timeParams.push(start);
  }
  if (end !== undefined) {
    timeFilter += ' AND created_at <= ?';
    timeParams.push(end);
  }

  // Union of:
  // 1. Likes: subject_did from collection='app.bsky.feed.like'
  // 2. Reposts: subject_did from collection='app.bsky.feed.repost'
  // 3. Replies: reply_parent_did from collection='app.bsky.feed.post' WHERE is_reply=1
  const sql = `
    SELECT did, collection, count FROM (
      SELECT subject_did as did, 'app.bsky.feed.like' as collection, COUNT(*) as count
      FROM records WHERE repo_did = ? AND collection = 'app.bsky.feed.like' AND subject_did IS NOT NULL ${timeFilter}
      GROUP BY subject_did
      UNION ALL
      SELECT subject_did as did, 'app.bsky.feed.repost' as collection, COUNT(*) as count
      FROM records WHERE repo_did = ? AND collection = 'app.bsky.feed.repost' AND subject_did IS NOT NULL ${timeFilter}
      GROUP BY subject_did
      UNION ALL
      SELECT reply_parent_did as did, 'reply' as collection, COUNT(*) as count
      FROM records WHERE repo_did = ? AND collection = 'app.bsky.feed.post' AND is_reply = 1 AND reply_parent_did IS NOT NULL ${timeFilter}
      GROUP BY reply_parent_did
    )
    ORDER BY count DESC
    LIMIT ?`;
  
  const params = [
    did, ...timeParams,
    did, ...timeParams,
    did, ...timeParams,
    limit
  ];
  return db.query(sql).all(...params) as InteractionPartner[];
}

// Content ratios: count of posts vs replies vs reposts vs likes
export function getContentRatios(db: Database, did: string, start?: number, end?: number): RatioData[] {
  let where = 'WHERE repo_did = ?';
  const params: any[] = [did];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end);
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
