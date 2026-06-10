import { Database } from 'bun:sqlite';
import { ClusterAnalysis, ClusterPost } from '../types.js';
import { BLUESKY_EPOCH, MISC_COHERENCE_THRESHOLD } from '../constants.js';

// Cosine similarity: (A · B) / (||A|| * ||B||)
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// k-means++ initialization
function initializeCentroids(vectors: Float32Array[], k: number): Float32Array[] {
  if (vectors.length === 0) return [];
  const centroids: Float32Array[] = [];

  // 1. Pick first centroid randomly
  const firstIndex = Math.floor(Math.random() * vectors.length);
  centroids.push(new Float32Array(vectors[firstIndex]));

  // 2. Pick subsequent centroids
  for (let i = 1; i < k; i++) {
    const distances = vectors.map(v => {
      let maxSim = -Infinity;
      for (const c of centroids) {
        const sim = cosineSimilarity(v, c);
        if (sim > maxSim) maxSim = sim;
      }
      // Distance for k-means++ is usually squared Euclidean.
      // For cosine similarity, we can use 1 - sim as distance.
      // Weighted probability uses distance squared.
      return Math.pow(1 - maxSim, 2);
    });

    const totalDistance = distances.reduce((a, b) => a + b, 0);
    let target = Math.random() * totalDistance;
    for (let j = 0; j < distances.length; j++) {
      target -= distances[j];
      if (target <= 0) {
        centroids.push(new Float32Array(vectors[j]));
        break;
      }
    }
    // Fallback if target wasn't reached due to precision issues
    if (centroids.length === i) {
      centroids.push(new Float32Array(vectors[vectors.length - 1]));
    }
  }

  return centroids;
}

export function kMeans(
  vectors: Float32Array[],
  k: number,
  maxIterations: number = 20,
  initialCentroids?: Float32Array[]
): { assignments: number[], centroids: Float32Array[] } {
  if (vectors.length === 0) return { assignments: [], centroids: [] };
  if (vectors.length < k) k = vectors.length;

  let centroids = initialCentroids && initialCentroids.length === k
    ? initialCentroids.map(c => new Float32Array(c))
    : initializeCentroids(vectors, k);
  let assignments = new Array(vectors.length).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assignment step
    for (let i = 0; i < vectors.length; i++) {
      let maxSim = -Infinity;
      let bestCluster = -1;
      for (let j = 0; j < k; j++) {
        const sim = cosineSimilarity(vectors[i], centroids[j]);
        if (sim > maxSim) {
          maxSim = sim;
          bestCluster = j;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed && iter > 0) break;

    // Update step
    const newCentroids = Array.from({ length: k }, () => new Float32Array(vectors[0].length).fill(0));
    const counts = new Array(k).fill(0);

    for (let i = 0; i < vectors.length; i++) {
      const cluster = assignments[i];
      counts[cluster]++;
      for (let d = 0; d < vectors[i].length; d++) {
        newCentroids[cluster][d] += vectors[i][d];
      }
    }

    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        for (let d = 0; d < newCentroids[j].length; d++) {
          newCentroids[j][d] /= counts[j];
        }
        centroids[j] = newCentroids[j];
      }
      // If a cluster is empty, keep it as it was (or could re-initialize)
    }
  }

  return { assignments, centroids };
}

export function inertia(vectors: Float32Array[], assignments: number[], centroids: Float32Array[]): number {
  let total = 0;
  for (let i = 0; i < vectors.length; i++) {
    total += 1 - cosineSimilarity(vectors[i], centroids[assignments[i]]);
  }
  return total;
}

export function kMeansBestOfN(vectors: Float32Array[], k: number, restarts: number = 8): { assignments: number[], centroids: Float32Array[] } {
  let best: { assignments: number[], centroids: Float32Array[] } | null = null;
  let bestInertia = Infinity;
  for (let r = 0; r < restarts; r++) {
    const result = kMeans(vectors, k);
    const score = inertia(vectors, result.assignments, result.centroids);
    if (score < bestInertia) {
      bestInertia = score;
      best = result;
    }
  }
  return best!;
}

export function getClusterData(db: Database, did: string, timeBin: string = 'month', start?: number, end?: number): ClusterAnalysis {
  const run = db.query(
    'SELECT id FROM cluster_runs WHERE repo_did = ? AND is_current = 1 ORDER BY id DESC LIMIT 1'
  ).get(did) as { id: number } | null;

  if (!run) return { clusters: [], series: [], posts: [] };

  const clusterRows = db.query(
    'SELECT cluster_id, label, label_source, coherence, color_index FROM clusters WHERE run_id = ? ORDER BY cluster_id'
  ).all(run.id) as { cluster_id: number, label: string, label_source: string, coherence: number | null, color_index: number | null }[];

  const clusters = clusterRows.map(c => ({
    id: c.cluster_id,
    label: c.label,
    labelSource: c.label_source,
    coherence: c.coherence,
    colorIndex: c.color_index,
    misc: c.coherence !== null && c.coherence < MISC_COHERENCE_THRESHOLD,
  }));

  let where = 'WHERE ca.run_id = ? AND r.created_at >= ? AND r.created_at <= ?';
  const params: any[] = [run.id, BLUESKY_EPOCH * 1000, Date.now()];
  if (start !== undefined) { where += ' AND r.created_at >= ?'; params.push(start * 1000); }
  if (end !== undefined) { where += ' AND r.created_at <= ?'; params.push(end * 1000); }

  const dateStrSql = timeBin === 'month'
    ? "strftime('%Y-%m', r.created_at/1000, 'unixepoch')"
    : "strftime('%Y-W%W', r.created_at/1000, 'unixepoch')";

  const series = db.query(`
    SELECT ${dateStrSql} as date, ca.cluster_id as clusterId, COUNT(*) as count
    FROM cluster_assignments ca
    JOIN records r ON r.id = ca.record_id
    ${where}
    GROUP BY date, ca.cluster_id
    ORDER BY date, ca.cluster_id
  `).all(...params) as { date: string, clusterId: number, count: number }[];

  const postRows = db.query(`
    SELECT ca.cluster_id as clusterId, r.raw_json, r.created_at
    FROM cluster_assignments ca
    JOIN records r ON r.id = ca.record_id
    ${where}
    ORDER BY r.created_at
  `).all(...params) as { clusterId: number, raw_json: string | null, created_at: number }[];

  const posts: ClusterPost[] = [];
  for (const row of postRows) {
    if (!row.raw_json) continue;
    try {
      const text = JSON.parse(row.raw_json).text;
      if (text) posts.push({ clusterId: row.clusterId, text, createdAt: row.created_at });
    } catch {
      // skip unparseable
    }
  }

  return { clusters, series, posts };
}
