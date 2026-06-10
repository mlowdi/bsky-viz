import { initDatabase } from './src/db/schema.js';
import { fetchRepo } from './src/ingest/fetch.js';
import { parseCarRecords } from './src/ingest/parse.js';
import { normalizeRecords } from './src/ingest/normalize.js';
import { upsertRepo, insertRecordBatch } from './src/db/queries.js';
import { resolveHandles } from './src/resolve.js';
import { createApp } from './src/server/index.js';
import { embedRecords } from './src/embed.js';
import { clusterRepo } from './src/cluster.js';
import { ModelHost } from './src/llm/host.js';

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

} else if (command === 'embed') {
  const input = process.argv[3];
  if (!input) {
    console.error('Usage: bun run cli.ts embed <did-or-handle> [--model model] [--batch-size size] [--url url]');
    process.exit(1);
  }
  
  let model: string | undefined;
  let batchSize = 50;
  let url: string | undefined;

  for (let i = 4; i < process.argv.length; i++) {
    if (process.argv[i] === '--model' && process.argv[i+1]) {
      model = process.argv[++i];
    } else if (process.argv[i] === '--batch-size' && process.argv[i+1]) {
      batchSize = parseInt(process.argv[++i], 10);
    } else if (process.argv[i] === '--url' && process.argv[i+1]) {
      url = process.argv[++i];
    }
  }

  const db = initDatabase();
  const repo = db.query('SELECT * FROM repos WHERE did = ? OR handle = ?').get(input, input) as { did: string } | null;
  if (!repo) {
    console.error(`Repo not found for ${input}. Please ingest it first.`);
    process.exit(1);
  }

  console.log(`Embedding posts for ${repo.did}...`);
  if (url) {
    const count = await embedRecords(db, repo.did, { batchSize, model, baseUrl: url });
    console.log(`\nEmbedded ${count} posts for DID: ${repo.did}`);
  } else {
    const host = new ModelHost();
    try {
      await host.ensure('embed');
      const count = await embedRecords(db, repo.did, { batchSize, model, baseUrl: host.base });
      console.log(`\nEmbedded ${count} posts for DID: ${repo.did}`);
    } finally {
      host.stop();
    }
  }

} else if (command === 'cluster') {
  const input = process.argv[3];
  if (!input) {
    console.error('Usage: bun run cli.ts cluster <did-or-handle> [--k 10]');
    process.exit(1);
  }

  let k = 10;
  for (let i = 4; i < process.argv.length; i++) {
    if (process.argv[i] === '--k' && process.argv[i+1]) {
      k = parseInt(process.argv[++i], 10);
    }
  }

  const db = initDatabase();
  const repo = db.query('SELECT * FROM repos WHERE did = ? OR handle = ?').get(input, input) as { did: string } | null;
  if (!repo) {
    console.error(`Repo not found for ${input}. Please ingest it first.`);
    process.exit(1);
  }

  const host = new ModelHost();
  try {
    await clusterRepo(db, repo.did, k, host);
  } finally {
    host.stop();
  }

} else {
  console.log('bsky-viz - ATproto repo metadata analyzer\n');
  console.log('Commands:');
  console.log('  bun run cli.ts ingest <did-or-handle> [--refresh]');
  console.log('  bun run cli.ts serve [--port]');
  console.log('  bun run cli.ts embed <did-or-handle> [--model string] [--batch-size int] [--url string]');
  console.log('  bun run cli.ts cluster <did-or-handle> [--k 10]');
}
