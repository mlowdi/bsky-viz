import { Database } from 'bun:sqlite';

export function initDatabase(path?: string): Database {
  const db = new Database(path || 'bsky-viz.sqlite');
  return db;
}
