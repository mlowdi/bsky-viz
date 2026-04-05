import { Database } from 'bun:sqlite';
import type { HeatmapCell, TimelinePoint, TypicalDayPoint, SleepWindow } from '../types.js';
import { BLUESKY_EPOCH } from '../constants.js';

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
  let where = "WHERE repo_did = ? AND created_at >= ? AND created_at <= ? AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')";
  const params: any[] = [did, BLUESKY_EPOCH * 1000, Date.now()];
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
  let where = "WHERE repo_did = ? AND created_at >= ? AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')";
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

export function getTypicalDay(
  db: Database, did: string, start?: number, end?: number
): TypicalDayPoint[] {
  let where = "WHERE repo_did = ? AND created_at >= ? AND created_at <= ? AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')";
  const params: any[] = [did, BLUESKY_EPOCH * 1000, Date.now()];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }
  const sql = `SELECT
    CAST(strftime('%H', created_at/1000, 'unixepoch') AS INTEGER) as hour,
    CASE
      WHEN collection = 'app.bsky.feed.post' AND is_reply = 1 THEN 'reply'
      WHEN collection = 'app.bsky.feed.post' AND (is_reply = 0 OR is_reply IS NULL) THEN 'original_post'
      ELSE collection
    END as collection,
    COUNT(*) as count
    FROM records
    ${where}
    GROUP BY hour, collection
    ORDER BY hour`;
  return db.query(sql).all(...params) as TypicalDayPoint[];
}

export function getAvailablePeriods(db: Database, did: string) {
  const sql = `SELECT DISTINCT 
    strftime('%Y', created_at/1000, 'unixepoch') as year,
    strftime('%m', created_at/1000, 'unixepoch') as month,
    COUNT(*) as count
  FROM records 
  WHERE repo_did = ? AND created_at >= ? AND created_at <= ? AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')
  GROUP BY year, month
  ORDER BY year, month`;
  return db.query(sql).all(did, BLUESKY_EPOCH * 1000, Date.now());
}

export function getSleepPattern(
  db: Database, did: string, start?: number, end?: number
): SleepWindow[] {
  let where = "WHERE repo_did = ? AND created_at >= ? AND created_at <= ? AND collection NOT IN ('app.bsky.feed.threadgate', 'app.bsky.feed.postgate', 'app.bsky.graph.listblock', 'app.bsky.graph.listitem', 'app.bsky.graph.list', 'app.bsky.actor.profile')";
  const params: any[] = [did, BLUESKY_EPOCH * 1000, Date.now()];
  if (start !== undefined) {
    where += ' AND created_at >= ?';
    params.push(start * 1000);
  }
  if (end !== undefined) {
    where += ' AND created_at <= ?';
    params.push(end * 1000);
  }

  const sql = `SELECT created_at FROM records ${where} ORDER BY created_at ASC`;
  const rows = db.query(sql).all(...params) as { created_at: number }[];

  if (rows.length === 0) return [];

  // Group events by calendar date (UTC)
  const days: Map<string, number[]> = new Map();
  for (const row of rows) {
    const dateStr = new Date(row.created_at).toISOString().split('T')[0];
    if (!days.has(dateStr)) days.set(dateStr, []);
    days.get(dateStr)!.push(row.created_at);
  }

  const sortedDates = Array.from(days.keys()).sort();
  const sleepWindows: SleepWindow[] = [];

  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const events = days.get(date)!;
    if (events.length < 3) continue;

    let longestGap = 0;
    let gapStart = 0;
    let gapEnd = 0;

    // Check gaps within the day
    for (let j = 0; j < events.length - 1; j++) {
      const gap = events[j + 1] - events[j];
      if (gap > longestGap) {
        longestGap = gap;
        gapStart = events[j];
        gapEnd = events[j + 1];
      }
    }

    // Check overnight gap to next day's first event
    if (i < sortedDates.length - 1) {
      const nextDateEvents = days.get(sortedDates[i + 1])!;
      const lastEventToday = events[events.length - 1];
      const firstEventTomorrow = nextDateEvents[0];
      const overnightGap = firstEventTomorrow - lastEventToday;
      if (overnightGap > longestGap) {
        longestGap = overnightGap;
        gapStart = lastEventToday;
        gapEnd = firstEventTomorrow;
      }
    }

    if (longestGap > 0) {
      const startD = new Date(gapStart);
      const endD = new Date(gapEnd);
      const gapStartHour = startD.getUTCHours() + startD.getUTCMinutes() / 60;
      const gapEndHour = endD.getUTCHours() + endD.getUTCMinutes() / 60;

      sleepWindows.push({
        date,
        gapStartHour,
        gapEndHour,
        gapMinutes: Math.round(longestGap / 60000),
      });
    }
  }

  return sleepWindows;
}