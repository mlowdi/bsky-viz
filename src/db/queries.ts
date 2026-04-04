import { Database } from 'bun:sqlite';
import type { RepoRow, RecordRow } from '../types.js';

export function upsertRepo(db: Database, repo: RepoRow): void {
  // stub
}

export function insertRecordBatch(db: Database, records: RecordRow[]): void {
  // stub
}

export function getRepos(db: Database): RepoRow[] {
  // stub
  return [];
}

export function getRepo(db: Database, did: string): RepoRow | null {
  // stub
  return null;
}

export function getRecordCount(db: Database, did: string): Record<string, number> {
  // stub
  return {};
}
