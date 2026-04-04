import { Database } from 'bun:sqlite';
import { getCachedHandles, cacheHandle } from './db/queries.js';

// Resolve a single DID to a handle via the public Bluesky AppView
async function resolveOne(did: string): Promise<string | null> {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!res.ok) return null;
    const data = await res.json() as { handle?: string };
    return data.handle ?? null;
  } catch {
    return null;
  }
}

// Batch resolve DIDs to handles, using cache first, then API for misses
// Resolves API calls sequentially with a small delay to avoid rate limits
export async function resolveHandles(db: Database, dids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(dids)];
  const cached = getCachedHandles(db, unique);
  const result: Record<string, string> = { ...cached };
  const misses = unique.filter(d => !cached[d]);

  for (const did of misses) {
    const handle = await resolveOne(did);
    if (handle) {
      result[did] = handle;
      cacheHandle(db, did, handle);
    }
  }

  return result;
}
