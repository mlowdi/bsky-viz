import { initDatabase } from './src/db/schema.js';
import { fetchRepo } from './src/ingest/fetch.js';
import { parseCarRecords } from './src/ingest/parse.js';
import { normalizeRecords } from './src/ingest/normalize.js';
import { upsertRepo, insertRecordBatch } from './src/db/queries.js';
import { resolveHandles } from './src/resolve.js';
import { createApp } from './src/server/index.js';

const command = process.argv[2];

if (command === 'ingest') {
  const input = process.argv[3];
  if (!input) {
    console.error('Usage: bun run cli.ts ingest <did-or-handle> [--refresh]');
    process.exit(1);
  }
  const refresh = process.argv.includes('--refresh');
  const db = initDatabase();

  // Check if already ingested
  const existing = db.query('SELECT * FROM repos WHERE did = ? OR handle = ?').get(input, input);
  if (existing && !refresh) {
    console.log(`Already ingested. Use --refresh to re-fetch.`);
    process.exit(0);
  }

  console.log(`Fetching repo for ${input}...`);
  const { did, carBytes } = await fetchRepo(input);
  console.log(`Downloaded ${(carBytes.length / 1024 / 1024).toFixed(1)}MB CAR file for ${did}`);

  console.log('Parsing records...');
  const { records: rawRecords, commitCid } = await parseCarRecords(carBytes);
  console.log(`Parsed ${rawRecords.length} records`);

  console.log('Normalizing and storing...');
  const normalized = normalizeRecords(did, rawRecords);

  // Resolve handle for display
  const handles = await resolveHandles(db, [did]);
  const handle = handles[did] || (input.startsWith('did:') ? null : input);

  upsertRepo(db, {
    did,
    handle,
    display_name: null,
    fetched_at: Date.now(),
    commit_cid: commitCid,
  });
  insertRecordBatch(db, normalized);

  // Print summary
  const counts: Record<string, number> = {};
  for (const r of normalized) {
    counts[r.collection] = (counts[r.collection] || 0) + 1;
  }
  console.log('\nIngested records:');
  for (const [col, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${col}: ${count}`);
  }
  console.log(`\nTotal: ${normalized.length} records stored.`);

} else if (command === 'serve') {
  const port = parseInt(process.argv[3] || '3000');
  const db = initDatabase();
  const app = createApp(db);
  console.log(`bsky-viz server running at http://localhost:${port}`);
  Bun.serve({ port, fetch: app.fetch });

} else {
  console.log('bsky-viz - ATproto repo metadata analyzer\n');
  console.log('Commands:');
  console.log('  bun run cli.ts ingest <did-or-handle> [--refresh]');
  console.log('  bun run cli.ts serve [--port]');
}
