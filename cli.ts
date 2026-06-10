import { Database } from 'bun:sqlite';
import { initDatabase } from './src/db/schema.js';
import { fetchRepo } from './src/ingest/fetch.js';
import { parseCarRecords } from './src/ingest/parse.js';
import { normalizeRecords } from './src/ingest/normalize.js';
import { upsertRepo, insertRecordBatch, getPostsWithoutEmbeddings } from './src/db/queries.js';
import { resolveHandles } from './src/resolve.js';
import { createApp } from './src/server/index.js';
import { embedRecords } from './src/embed.js';
import { clusterRepo } from './src/cluster.js';
import { ModelHost } from './src/llm/host.js';

const command = process.argv[2];

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function requireRepo(db: Database, input: string): string {
  const repo = db.query('SELECT did FROM repos WHERE did = ? OR handle = ?').get(input, input) as { did: string } | null;
  if (!repo) {
    console.error(`Repo not found for ${input}. Please ingest it first.`);
    process.exit(1);
  }
  return repo.did;
}

async function doIngest(db: Database, input: string, refresh: boolean): Promise<string | null> {
  const existing = db.query('SELECT did FROM repos WHERE did = ? OR handle = ?').get(input, input) as { did: string } | null;
  if (existing && !refresh) {
    console.log(`Already ingested. Use --refresh to re-fetch.`);
    return existing.did;
  }

  console.log(`Fetching repo for ${input}...`);
  const { did, carBytes } = await fetchRepo(input);
  console.log(`Downloaded ${(carBytes.length / 1024 / 1024).toFixed(1)}MB CAR file for ${did}`);

  console.log('Parsing records...');
  const { records: rawRecords, commitCid } = await parseCarRecords(carBytes);
  console.log(`Parsed ${rawRecords.length} records`);

  console.log('Normalizing and storing...');
  const { records: normalized, unknown, anachronistic } = normalizeRecords(did, rawRecords);

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

  const counts: Record<string, number> = {};
  for (const r of normalized) {
    counts[r.collection] = (counts[r.collection] || 0) + 1;
  }
  console.log('\nIngested records:');
  for (const [col, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${col}: ${count}`);
  }
  const unknownEntries = Object.entries(unknown).sort((a, b) => b[1] - a[1]);
  if (unknownEntries.length > 0) {
    console.log('\nUnknown records in repo (not stored):');
    for (const [col, count] of unknownEntries) {
      console.log(`  ${col}: ${count}`);
    }
  }
  if (anachronistic.count > 0) {
    const fmt = (ms: number) => new Date(ms).toISOString().split('T')[0];
    console.log(
      `\nAnachronistic timestamps: ${anachronistic.count} records outside ` +
      `[2023-01-01, today] (${fmt(anachronistic.earliest!)} … ${fmt(anachronistic.latest!)}). ` +
      `Stored, but hidden from time-binned views.`
    );
  }
  console.log(`\nTotal: ${normalized.length} records stored.`);
  return did;
}

async function doEmbed(db: Database, did: string, opts: { batchSize: number, model?: string, url?: string, host?: ModelHost }): Promise<void> {
  console.log(`Embedding posts for ${did}...`);
  if (getPostsWithoutEmbeddings(db, did).length === 0) {
    console.log('Nothing to embed.');
    return;
  }
  if (opts.url) {
    const count = await embedRecords(db, did, { batchSize: opts.batchSize, model: opts.model, baseUrl: opts.url });
    console.log(`\nEmbedded ${count} posts for DID: ${did}`);
    return;
  }
  const host = opts.host ?? new ModelHost();
  try {
    await host.ensure('embed');
    const count = await embedRecords(db, did, { batchSize: opts.batchSize, model: opts.model, baseUrl: host.base });
    console.log(`\nEmbedded ${count} posts for DID: ${did}`);
  } finally {
    if (!opts.host) host.stop();
  }
}

if (command === 'ingest') {
  const input = process.argv[3];
  if (!input) {
    console.error('Usage: bun run cli.ts ingest <did-or-handle> [--refresh]');
    process.exit(1);
  }
  const db = initDatabase();
  await doIngest(db, input, process.argv.includes('--refresh'));

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
  const db = initDatabase();
  const did = requireRepo(db, input);
  await doEmbed(db, did, {
    batchSize: parseInt(flagValue('--batch-size') || '50', 10),
    model: flagValue('--model'),
    url: flagValue('--url'),
  });

} else if (command === 'cluster') {
  const input = process.argv[3];
  if (!input) {
    console.error('Usage: bun run cli.ts cluster <did-or-handle> [--k 10]');
    process.exit(1);
  }
  const db = initDatabase();
  const did = requireRepo(db, input);
  const host = new ModelHost();
  try {
    await clusterRepo(db, did, parseInt(flagValue('--k') || '10', 10), host);
  } finally {
    host.stop();
  }

} else if (command === 'process') {
  const input = process.argv[3];
  if (!input) {
    console.error('Usage: bun run cli.ts process <did-or-handle> [--k 10]');
    process.exit(1);
  }
  const db = initDatabase();
  const t0 = Date.now();

  console.log('=== ingest ===');
  const did = await doIngest(db, input, true);
  if (!did) process.exit(1);

  const host = new ModelHost();
  try {
    console.log('\n=== embed ===');
    await doEmbed(db, did, { batchSize: 50, host });

    console.log('\n=== cluster ===');
    await clusterRepo(db, did, parseInt(flagValue('--k') || '10', 10), host);
  } finally {
    host.stop();
  }
  console.log(`\nProcessed ${input} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

} else {
  console.log('bsky-viz - ATproto repo metadata analyzer\n');
  console.log('Commands:');
  console.log('  bun run cli.ts ingest <did-or-handle> [--refresh]');
  console.log('  bun run cli.ts embed <did-or-handle> [--model string] [--batch-size int] [--url string]');
  console.log('  bun run cli.ts cluster <did-or-handle> [--k 10]');
  console.log('  bun run cli.ts process <did-or-handle> [--k 10]   # ingest + embed + cluster');
  console.log('  bun run cli.ts serve [--port]');
}
