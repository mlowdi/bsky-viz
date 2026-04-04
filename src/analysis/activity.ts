import { Database } from 'bun:sqlite';
import type { HeatmapCell, TimelinePoint } from '../types.js';

// Activity heatmap: for a given DID, count records by (dayOfWeek, hourOfDay)
// Uses SQLite date functions on created_at (stored as unix ms)
// Allow filtering by collection (optional, default = all)
export function getActivityHeatmap(
  db: Database, did: string, collection?: string, start?: number, end?: number
): HeatmapCell[] {
  // Convert unix ms to datetime components:
  // strftime('%w', created_at/1000, 'unixepoch') = day of week (0=Sun)
  // strftime('%H', created_at/1000, 'unixepoch') = hour (00-23)
  // GROUP BY dayOfWeek, hourOfDay, COUNT(*)
  let where = "WHERE repo_did = ? AND created_at IS NOT NULL AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')";
  const params: any[] = [did];
  if (collection) {
    where += ' AND collection = ?';
    params.push(collection);
  }
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }
  const sql = `SELECT
    CAST(strftime('%w', created_at/1000, 'unixepoch') AS INTEGER) as dayOfWeek,
    CAST(strftime('%H', created_at/1000, 'unixepoch') AS INTEGER) as hourOfDay,
    COUNT(*) as count
    FROM records ${where}
    GROUP BY dayOfWeek, hourOfDay`;
  return db.query(sql).all(...params) as HeatmapCell[];
}

// Activity timeline: records per day, grouped by collection
// Returns array of { date: 'YYYY-MM-DD', collection, count }
export function getActivityTimeline(
  db: Database, did: string, start?: number, end?: number
): TimelinePoint[] {
  let where = "WHERE repo_did = ? AND created_at IS NOT NULL AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')";
  const params: any[] = [did];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }
  const sql = `SELECT
    strftime('%Y-%m-%d', created_at/1000, 'unixepoch') as date,
    CASE
      WHEN collection = 'app.bsky.feed.post' AND is_reply = 1 THEN 'reply'
      WHEN collection = 'app.bsky.feed.post' AND (is_reply = 0 OR is_reply IS NULL) THEN 'original_post'
      ELSE collection
    END as collection,
    COUNT(*) as count
    FROM records
    ${where}
    GROUP BY date, collection
    ORDER BY date`;
  return db.query(sql).all(...params) as TimelinePoint[];
}

export function getAvailablePeriods(db: Database, did: string) {
  const sql = `SELECT DISTINCT 
    strftime('%Y', created_at/1000, 'unixepoch') as year,
    strftime('%m', created_at/1000, 'unixepoch') as month,
    COUNT(*) as count
  FROM records 
  WHERE repo_did = ? AND created_at IS NOT NULL AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')
  GROUP BY year, month
  ORDER BY year, month`;
  return db.query(sql).all(did);
}