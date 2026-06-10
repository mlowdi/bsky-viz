import { Database } from 'bun:sqlite';
import { kMeans, kMeansBestOfN, cosineSimilarity } from './analysis/clusters.js';
import { ModelHost } from './llm/host.js';
import { embedTexts } from './embed.js';
import { BLUESKY_EPOCH, EMBEDDING_MODEL } from './constants.js';

const QA_THRESHOLD = 0.35;
const MATCH_THRESHOLD = 0.9;
const CORE_SAMPLES = 6;
const SPREAD_SAMPLES = 4;

interface PostRow {
  id: number;
  created_at: number;
  raw_json: string;
  embedding: Uint8Array;
}

interface ClusterState {
  clusterId: number;
  centroid: Float32Array;
  memberIdx: number[];
  coherence: number;
  label: string;
  labelSource: 'llm' | 'centroid-fallback' | 'inherited';
  colorIndex: number;
}

function cleanText(text: string, maxLen: number = 300): string {
  const stripped = text.replace(/https?:\/\/([^\/\s]+)\S*/g, '$1');
  return stripped.length > maxLen ? stripped.substring(0, maxLen - 3) + '...' : stripped;
}

function postText(row: PostRow): string {
  try {
    return JSON.parse(row.raw_json)?.text || '';
  } catch {
    return '';
  }
}

function sampleCluster(cluster: ClusterState, rows: PostRow[], vectors: Float32Array[]): string[] {
  const ranked = cluster.memberIdx
    .map(i => ({ i, sim: cosineSimilarity(vectors[i], cluster.centroid) }))
    .sort((a, b) => b.sim - a.sim);
  const texts: string[] = [];
  const used = new Set<number>();

  for (const { i } of ranked) {
    if (texts.length >= CORE_SAMPLES) break;
    const t = postText(rows[i]);
    if (t.trim()) {
      texts.push(cleanText(t));
      used.add(i);
    }
  }

  const lo = Math.floor(ranked.length * 0.4);
  const hi = Math.floor(ranked.length * 0.7);
  if (hi > lo) {
    const step = Math.max(1, Math.floor((hi - lo) / SPREAD_SAMPLES));
    let added = 0;
    for (let pos = lo; pos < hi && added < SPREAD_SAMPLES; pos += step) {
      const { i } = ranked[pos];
      if (used.has(i)) continue;
      const t = postText(rows[i]);
      if (t.trim()) {
        texts.push(cleanText(t));
        used.add(i);
        added++;
      }
    }
  }

  return texts;
}

function centroidPostLabel(cluster: ClusterState, rows: PostRow[], vectors: Float32Array[]): string {
  let maxSim = -Infinity;
  let best = -1;
  for (const i of cluster.memberIdx) {
    const sim = cosineSimilarity(vectors[i], cluster.centroid);
    if (sim > maxSim) {
      maxSim = sim;
      best = i;
    }
  }
  let label = `Cluster ${cluster.clusterId}`;
  if (best !== -1) {
    const text = postText(rows[best]);
    if (text) label = text.length > 80 ? text.substring(0, 77) + '...' : text;
  }
  return label;
}

async function requestLabels(
  host: ModelHost,
  targets: ClusterState[],
  samples: Map<number, string[]>,
  context: { id: number, label: string }[],
  nudge: boolean
): Promise<Map<number, string>> {
  let prompt = `Here are ${targets.length} groups of posts from one Bluesky account, produced by semantic clustering. For each group, write a 2-5 word label capturing what distinguishes it from the OTHER groups. The label may describe topic, style, or kind-of-post — whichever fits best. Labels must be mutually distinct. If a group has no coherent theme, label it "Mixed / misc".`;
  if (nudge) {
    prompt += `\n\nBe literal: describe only what the posts actually say, no abstraction or interpretation.`;
  }
  if (context.length > 0) {
    prompt += `\n\nOther groups in this clustering already have these labels (your labels must be distinct from them): ${context.map(c => `"${c.label}"`).join(', ')}.`;
  }
  for (const cluster of targets) {
    prompt += `\n\n## Group ${cluster.clusterId}\n`;
    prompt += (samples.get(cluster.clusterId) || []).map(t => `- ${t.replace(/\n/g, ' ')}`).join('\n');
  }

  const schema = {
    type: 'object',
    properties: {
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cluster: { type: 'integer' },
            label: { type: 'string' },
          },
          required: ['cluster', 'label'],
          additionalProperties: false,
        },
      },
    },
    required: ['labels'],
    additionalProperties: false,
  };

  const res = await fetch(`${host.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'label',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.2,
      response_format: { type: 'json_schema', json_schema: { name: 'out', schema, strict: true } },
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  if (!res.ok) throw new Error(`labeling request failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('labeling response had empty content');
  const parsed = JSON.parse(content) as { labels: { cluster: number, label: string }[] };

  const out = new Map<number, string>();
  for (const { cluster, label } of parsed.labels) {
    if (label.trim()) out.set(cluster, label.trim());
  }
  return out;
}

async function qaLabels(
  host: ModelHost,
  labels: Map<number, string>,
  clusters: ClusterState[]
): Promise<{ passed: Map<number, string>, failed: number[] }> {
  const entries = [...labels.entries()];
  if (entries.length === 0) return { passed: new Map(), failed: [] };
  const vectors = await embedTexts(entries.map(e => e[1]), { baseUrl: host.base });
  const byId = new Map(clusters.map(c => [c.clusterId, c]));
  const passed = new Map<number, string>();
  const failed: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [clusterId, label] = entries[i];
    const centroid = byId.get(clusterId)!.centroid;
    const sim = cosineSimilarity(new Float32Array(vectors[i]), centroid);
    console.log(`  QA cluster ${clusterId}: "${label}" sim=${sim.toFixed(3)} ${sim >= QA_THRESHOLD ? 'OK' : 'FAIL'}`);
    if (sim >= QA_THRESHOLD) passed.set(clusterId, label);
    else failed.push(clusterId);
  }
  return { passed, failed };
}

export async function clusterRepo(db: Database, did: string, k: number, host: ModelHost): Promise<void> {
  const t0 = Date.now();
  const rows = db.query(`
    SELECT id, created_at, raw_json, embedding
    FROM records
    WHERE repo_did = ? AND collection = 'app.bsky.feed.post'
      AND created_at >= ? AND created_at <= ? AND embedding IS NOT NULL
    ORDER BY created_at
  `).all(did, BLUESKY_EPOCH * 1000, Date.now()) as PostRow[];

  if (rows.length === 0) {
    console.log('No embedded posts found; run embed first.');
    return;
  }
  console.log(`Clustering ${rows.length} embedded posts (k=${k})...`);

  const vectors = rows.map(r => new Float32Array(new Uint8Array(r.embedding).buffer));

  const prevRun = db.query(
    'SELECT id, k FROM cluster_runs WHERE repo_did = ? AND is_current = 1 ORDER BY id DESC LIMIT 1'
  ).get(did) as { id: number, k: number } | null;

  let prevClusters: { cluster_id: number, label: string, label_source: string, color_index: number | null, centroid: Float32Array }[] = [];
  if (prevRun) {
    prevClusters = (db.query(
      'SELECT cluster_id, label, label_source, color_index, centroid FROM clusters WHERE run_id = ?'
    ).all(prevRun.id) as { cluster_id: number, label: string, label_source: string, color_index: number | null, centroid: Uint8Array }[])
      .map(c => ({ ...c, centroid: new Float32Array(new Uint8Array(c.centroid).buffer) }));
  }

  let result: { assignments: number[], centroids: Float32Array[] };
  if (prevRun && prevRun.k === k && prevClusters.length === k) {
    console.log(`Warm-starting k-means from run ${prevRun.id} centroids...`);
    result = kMeans(vectors, k, 20, prevClusters.map(c => c.centroid));
  } else {
    console.log('Running k-means++ best-of-8 restarts...');
    result = kMeansBestOfN(vectors, k, 8);
  }
  const actualK = result.centroids.length;
  console.log(`k-means done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const clusters: ClusterState[] = [];
  for (let j = 0; j < actualK; j++) {
    const memberIdx: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (result.assignments[i] === j) memberIdx.push(i);
    }
    let cohSum = 0;
    for (const i of memberIdx) cohSum += cosineSimilarity(vectors[i], result.centroids[j]);
    clusters.push({
      clusterId: j,
      centroid: result.centroids[j],
      memberIdx,
      coherence: memberIdx.length > 0 ? cohSum / memberIdx.length : 0,
      label: '',
      labelSource: 'centroid-fallback',
      colorIndex: -1,
    });
  }

  // Greedy centroid matching against previous run
  const usedColors = new Set<number>();
  if (prevClusters.length > 0) {
    const pairs: { newIdx: number, oldIdx: number, sim: number }[] = [];
    for (let n = 0; n < clusters.length; n++) {
      for (let o = 0; o < prevClusters.length; o++) {
        pairs.push({ newIdx: n, oldIdx: o, sim: cosineSimilarity(clusters[n].centroid, prevClusters[o].centroid) });
      }
    }
    pairs.sort((a, b) => b.sim - a.sim);
    const matchedNew = new Set<number>();
    const matchedOld = new Set<number>();
    for (const { newIdx, oldIdx, sim } of pairs) {
      if (sim < MATCH_THRESHOLD) break;
      if (matchedNew.has(newIdx) || matchedOld.has(oldIdx)) continue;
      matchedNew.add(newIdx);
      matchedOld.add(oldIdx);
      const old = prevClusters[oldIdx];
      if (old.label_source !== 'centroid-fallback') {
        clusters[newIdx].label = old.label;
        clusters[newIdx].labelSource = 'inherited';
      }
      if (old.color_index !== null) {
        clusters[newIdx].colorIndex = old.color_index;
        usedColors.add(old.color_index);
      }
    }
    console.log(`Centroid matching: ${matchedNew.size}/${clusters.length} clusters matched run ${prevRun!.id}`);
  }

  let nextColor = 0;
  for (const cluster of clusters) {
    if (cluster.colorIndex === -1) {
      while (usedColors.has(nextColor)) nextColor++;
      cluster.colorIndex = nextColor;
      usedColors.add(nextColor);
    }
  }

  // Persist run with fallback labels first; LLM pass updates them after
  for (const cluster of clusters) {
    if (cluster.labelSource !== 'inherited') {
      cluster.label = centroidPostLabel(cluster, rows, vectors);
    }
  }

  const idsHash = new Bun.CryptoHasher('sha256');
  idsHash.update(`k=${k};model=${EMBEDDING_MODEL};ids=${rows.map(r => r.id).join(',')}`);
  const paramsHash = idsHash.digest('hex');

  const runId = db.transaction(() => {
    db.query('UPDATE cluster_runs SET is_current = 0 WHERE repo_did = ?').run(did);
    const r = db.query(
      'INSERT INTO cluster_runs (repo_did, k, params_hash, created_at, is_current) VALUES (?, ?, ?, ?, 1) RETURNING id'
    ).get(did, k, paramsHash, Date.now()) as { id: number };
    const insertCluster = db.query(
      'INSERT INTO clusters (run_id, cluster_id, label, label_source, centroid, coherence, color_index) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const c of clusters) {
      insertCluster.run(r.id, c.clusterId, c.label, c.labelSource, Buffer.from(c.centroid.buffer), c.coherence, c.colorIndex);
    }
    const insertAssignment = db.query(
      'INSERT INTO cluster_assignments (run_id, record_id, cluster_id, similarity) VALUES (?, ?, ?, ?)'
    );
    for (let i = 0; i < rows.length; i++) {
      insertAssignment.run(r.id, rows[i].id, result.assignments[i], cosineSimilarity(vectors[i], result.centroids[result.assignments[i]]));
    }
    return r.id;
  })();
  console.log(`Persisted run ${runId} (${clusters.length} clusters, ${rows.length} assignments)`);

  const toLabel = clusters.filter(c => c.labelSource !== 'inherited');
  if (toLabel.length === 0) {
    console.log('All clusters inherited labels; skipping LLM pass.');
    return;
  }

  try {
    const samples = new Map<number, string[]>();
    for (const cluster of toLabel) {
      samples.set(cluster.clusterId, sampleCluster(cluster, rows, vectors));
    }
    const inheritedContext = clusters
      .filter(c => c.labelSource === 'inherited')
      .map(c => ({ id: c.clusterId, label: c.label }));

    console.log(`Labeling ${toLabel.length} clusters via LLM...`);
    const tLabel = Date.now();
    await host.ensure('label');
    let labels = await requestLabels(host, toLabel, samples, inheritedContext, false);
    console.log(`LLM labels in ${((Date.now() - tLabel) / 1000).toFixed(1)}s`);

    await host.ensure('embed');
    let { passed, failed } = await qaLabels(host, labels, toLabel);

    if (failed.length > 0) {
      console.log(`Retrying ${failed.length} failed labels with literal nudge...`);
      const retryTargets = toLabel.filter(c => failed.includes(c.clusterId));
      const retryContext = [
        ...inheritedContext,
        ...[...passed.entries()].map(([id, label]) => ({ id, label })),
      ];
      await host.ensure('label');
      const retryLabels = await requestLabels(host, retryTargets, samples, retryContext, true);
      await host.ensure('embed');
      const retryResult = await qaLabels(host, retryLabels, toLabel);
      for (const [id, label] of retryResult.passed) passed.set(id, label);
      for (const id of retryResult.failed) {
        console.log(`  cluster ${id}: keeping centroid-post fallback label`);
      }
    }

    const updateLabel = db.query('UPDATE clusters SET label = ?, label_source = ? WHERE run_id = ? AND cluster_id = ?');
    for (const [clusterId, label] of passed) {
      updateLabel.run(label, 'llm', runId, clusterId);
      const c = clusters.find(x => x.clusterId === clusterId)!;
      c.label = label;
      c.labelSource = 'llm';
    }
  } catch (err) {
    console.error(`LLM labeling failed; clusters keep centroid-post labels:`, err);
  }

  console.log(`\nRun ${runId} complete in ${((Date.now() - t0) / 1000).toFixed(1)}s:`);
  for (const c of clusters) {
    console.log(`  [${c.clusterId}] (${c.memberIdx.length} posts, coherence=${c.coherence.toFixed(3)}, color=${c.colorIndex}, ${c.labelSource}) ${c.label}`);
  }
}
