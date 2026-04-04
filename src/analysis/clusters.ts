import { Database } from 'bun:sqlite';
import { ClusterAnalysis } from '../types.js';

// Cosine similarity: (A · B) / (||A|| * ||B||)
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
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

export function kMeans(vectors: Float32Array[], k: number, maxIterations: number = 20): { assignments: number[], centroids: Float32Array[] } {
  if (vectors.length === 0) return { assignments: [], centroids: [] };
  if (vectors.length < k) k = vectors.length;

  let centroids = initializeCentroids(vectors, k);
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

export function getClusterAnalysis(db: Database, did: string, k: number = 10, timeBin: string = 'month'): ClusterAnalysis {
  const sql = `
    SELECT id, created_at, raw_json, embedding 
    FROM records 
    WHERE repo_did = ? 
      AND collection = 'app.bsky.feed.post' 
      AND embedding IS NOT NULL 
    ORDER BY created_at
  `;
  const rows = db.query(sql).all(did) as { id: number, created_at: number, raw_json: string, embedding: Uint8Array }[];

  if (rows.length === 0) {
    return { clusters: [], series: [] };
  }

  const vectors = rows.map(row => new Float32Array(new Uint8Array(row.embedding).buffer));
  const { assignments, centroids } = kMeans(vectors, k);

  // Find labels: for each cluster, find post closest to centroid
  const clusters: Array<{ id: number; label: string }> = [];
  for (let j = 0; j < centroids.length; j++) {
    let maxSim = -Infinity;
    let bestRowIdx = -1;
    for (let i = 0; i < vectors.length; i++) {
      if (assignments[i] === j) {
        const sim = cosineSimilarity(vectors[i], centroids[j]);
        if (sim > maxSim) {
          maxSim = sim;
          bestRowIdx = i;
        }
      }
    }

    let label = `Cluster ${j}`;
    if (bestRowIdx !== -1) {
      try {
        const rawJson = JSON.parse(rows[bestRowIdx].raw_json);
        label = rawJson.text || label;
        if (label.length > 80) label = label.substring(0, 77) + '...';
      } catch (e) {
        // ignore JSON parse errors
      }
    }
    clusters.push({ id: j, label });
  }

  // Bin by time and count
  const dateStrSql = timeBin === 'month' 
    ? "strftime('%Y-%m', created_at/1000, 'unixepoch')"
    : "strftime('%Y-W%W', created_at/1000, 'unixepoch')";
  
  // Use SQLite for consistent date string calculation
  const dateRows = db.query(`
    SELECT id, ${dateStrSql} as date 
    FROM records 
    WHERE repo_did = ? 
      AND collection = 'app.bsky.feed.post' 
      AND embedding IS NOT NULL 
    ORDER BY created_at
  `).all(did) as { id: number, date: string }[];

  const series: Array<{ date: string, clusterId: number, count: number }> = [];
  const counts = new Map<string, Map<number, number>>();

  dateRows.forEach((row, i) => {
    const clusterId = assignments[i];
    const date = row.date;
    if (!counts.has(date)) counts.set(date, new Map());
    const clusterCounts = counts.get(date)!;
    clusterCounts.set(clusterId, (clusterCounts.get(clusterId) || 0) + 1);
  });

  counts.forEach((clusterCounts, date) => {
    clusterCounts.forEach((count, clusterId) => {
      series.push({ date, clusterId, count });
    });
  });

  // Sort series by date then clusterId
  series.sort((a, b) => a.date.localeCompare(b.date) || a.clusterId - b.clusterId);

  return { clusters, series };
}
