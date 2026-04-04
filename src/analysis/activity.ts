import { Database } from 'bun:sqlite';
import type { HeatmapCell, TimelinePoint } from '../types.js';

// Activity heatmap: for a given DID, count records by (dayOfWeek, hourOfDay)
// Uses SQLite date functions on created_at (stored as unix ms)
// Allow filtering by collection (optional, default = all)
export function getActivityHeatmap(
  db: Database, did: string, collection?: string
): HeatmapCell[] {
  // Convert unix ms to datetime components:
  // strftime('%w', created_at/1000, 'unixepoch') = day of week (0=Sun)
  // strftime('%H', created_at/1000, 'unixepoch') = hour (00-23)
  // GROUP BY dayOfWeek, hourOfDay, COUNT(*)
  const where = collection
    ? 'WHERE repo_did = ? AND collection = ? AND created_at IS NOT NULL'
    : 'WHERE repo_did = ? AND created_at IS NOT NULL';
  const params = collection ? [did, collection] : [did];
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
  db: Database, did: string
): TimelinePoint[] {
  const sql = `SELECT
    strftime('%Y-%m-%d', created_at/1000, 'unixepoch') as date,
    collection,
    COUNT(*) as count
    FROM records
    WHERE repo_did = ? AND created_at IS NOT NULL
    GROUP BY date, collection
    ORDER BY date`;
  return db.query(sql).all(did) as TimelinePoint[];
}
