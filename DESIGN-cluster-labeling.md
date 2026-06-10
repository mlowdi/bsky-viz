# Design: persistent clustering + LLM-generated cluster labels

Status: design only, not implemented. Written 2026-06-09 (Liv, on launch-day Fable 5 no less).
Implementation target: any competent model. Everything here is reasoned and decided;
the implementing model should follow this doc, not re-litigate it.

## Problem

The topic themeriver labels clusters with the raw text of the post nearest the
centroid (`src/analysis/clusters.ts`, `getClusterAnalysis`). Two problems:

1. **Labels are unrepresentative.** A single near-centroid post is a point sample
   of a distribution — it tells you "a post that lives near the middle," not what
   the cluster *contains* (topic, style, or kind-of-post).
2. **The clusters themselves are ephemeral.** k-means runs per API request with
   unseeded `Math.random()` init. Every reload/date-range change produces
   different clusters. Labels are attached to entities that evaporate after each
   response. This also makes LLM labeling impossible (can't run a ~30s labeling
   pass inside a request handler, can't cache labels for clusters that don't
   persist).

Fixing (2) is a prerequisite for fixing (1).

## Architecture change: clustering becomes a persisted pipeline stage

Follow the existing `embed` pattern (`src/embed.ts`, offline enrichment via CLI):

```
bun run cli.ts cluster <did-or-handle> [--k 10] [--llm-url http://localhost:8080/v1] [--llm-model gemma-4-E4B]
```

The command:

1. Loads all embedded posts for the repo (same query as today).
2. Runs k-means **best-of-N restarts** (N=5–10), keeps the run with lowest
   inertia (sum of 1-cosine to assigned centroid). This replaces "random init,
   pray" with "random init, select." Reuse the existing `kMeans` / `cosineSimilarity`.
3. Persists results (schema below).
4. Runs the LLM labeling pass (below). If the LLM endpoint is down, falls back
   to the current centroid-post label, recorded as such.

### Schema additions

```sql
CREATE TABLE IF NOT EXISTS cluster_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_did TEXT NOT NULL,
  k INTEGER NOT NULL,
  params_hash TEXT NOT NULL,      -- hash of (k, embedding model, post-id set) for cache invalidation
  created_at INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS clusters (
  run_id INTEGER NOT NULL REFERENCES cluster_runs(id),
  cluster_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  label_source TEXT NOT NULL,     -- 'llm' | 'centroid-fallback' | 'inherited'
  centroid BLOB NOT NULL,         -- Float32Array bytes, same encoding as records.embedding
  coherence REAL,                 -- mean cosine(member, centroid); low = junk cluster
  color_index INTEGER,            -- stable palette slot, survives re-runs (see identity section)
  PRIMARY KEY (run_id, cluster_id)
);

CREATE TABLE IF NOT EXISTS cluster_assignments (
  run_id INTEGER NOT NULL,
  record_id INTEGER NOT NULL REFERENCES records(id),
  cluster_id INTEGER NOT NULL,
  similarity REAL NOT NULL,       -- cosine(post, its centroid) — used for sampling + outlier detection
  PRIMARY KEY (run_id, record_id)
);
```

An assignment table (not a `cluster_id` column on `records`) so multiple runs can
coexist and a re-run never mutates record rows.

### API/UI change

`GET /api/repos/:did/clusters?bin=month&start=&end=` becomes a **pure read**:
join `cluster_assignments` (current run) to `records`, bin by time, return
series + labels. No math in the request path. The browser only renders.

**Cluster globally, filter temporally.** Date-range drill-down filters the
*series* of the one global clustering — it does NOT re-cluster. This keeps
labels and colors stable across navigation, which is what makes the themeriver
readable. (It also means the `start`/`end` params to clustering itself go away.)

## Labeling strategy

### Sampling per cluster

- **5–8 core posts**: highest `similarity` to centroid. The "what is this about" signal.
- **3–4 spread posts**: posts at the 40th–70th percentile of similarity rank.
  Shows breadth without lying.
- **NO true outliers.** The farthest members of a k-means cluster are typically
  forced assignments that belong to no cluster. Feeding them to the labeler
  produces mush ("various topics including..."). Outliers are a QA signal, not
  a labeling input.
- Truncate each sampled post to ~300 chars. Strip URLs to bare domains (URLs
  burn tokens and carry little semantic signal vs. their surrounding text).

### One contrastive prompt, all clusters at once

A good label answers "what makes this cluster NOT the other nine," not "what is
this about." Per-cluster prompts in isolation yield three clusters all labeled
"AI discussion." Therefore: **a single prompt containing all k clusters' samples.**

Budget: 10 clusters × ~10 posts × ~50 tokens ≈ 5–7k prompt tokens, ~200 output
tokens. On gemma-4-E4B (lemonade-ROCm, ~360 t/s prefill per the field report in
`~/projects/local-llm/gemma4-on-radeon-780m-field-report.md`): under a minute
total, single call. This is a prompt-heavy/decode-light workload — exactly
E4B's sweet spot. Do NOT use the 26B-MOE; decode quality is irrelevant for
5-word labels and E4B prefills ~2.3× faster.

Prompt shape (system or single user message):

> Here are N groups of posts from one Bluesky account, produced by semantic
> clustering. For each group, write a 2–5 word label capturing what
> distinguishes it from the OTHER groups. The label may describe topic, style,
> or kind-of-post — whichever fits best. Labels must be mutually distinct.
> If a group has no coherent theme, label it "Mixed / misc".

The facet flexibility matters: some clusters are topical ("local LLM
benchmarking"), some behavioral ("good-morning posts", "reply dunks"). Forcing
topic labels onto behavioral clusters is how centroid-post labels fail today.

### Output enforcement

Call the OpenAI-compatible endpoint (llama-server, default
`http://localhost:8080/v1` — same convention as `embed.ts` uses for Ollama)
with `response_format` / json-schema-constrained generation:

```json
{ "labels": [ { "cluster": 0, "label": "..." }, ... ] }
```

llama-server enforces the grammar at sampling time — malformed output is
impossible, no parse-retry logic needed.

### QA loop (label validation by the same geometry that built the clusters)

The embedding model is already wired in. After labels come back:

1. Embed each label (same model as posts — snowflake-arctic-embed2 or whatever
   `embed` used; record which in `params_hash`).
2. Cosine the label embedding against the cluster centroid.
3. Accept if above threshold (calibrate empirically; start ~0.35 and adjust —
   label-vs-post similarity runs lower than post-vs-post).
4. Below threshold: retry once with a "be more literal, describe only what the
   posts actually say" nudge. Still bad → fall back to centroid-post label,
   `label_source = 'centroid-fallback'`.

Also compute and store `coherence` (mean member-centroid similarity) per
cluster. Low-coherence clusters should render as a grey "Misc" stream in the
UI rather than pretending to be a topic.

## Cluster identity across re-ingests (the next problem, solved in advance)

When new posts arrive and clustering re-runs, "the llama.cpp cluster" must keep
its label and color. Two mechanisms, use both:

1. **Warm-start k-means from the previous run's centroids** instead of k-means++
   when a previous run exists. New posts perturb centroids slightly; identities
   survive naturally and convergence is fast. Only fall back to fresh k-means++
   (best-of-N) when there is no prior run or k changed.
2. **Centroid matching between runs.** After clustering, match new centroids to
   previous-run centroids by cosine similarity — greedy max-similarity matching
   is fine at k≤16 (Hungarian is overkill). For matches above ~0.9:
   - inherit `label` (`label_source = 'inherited'`) and `color_index`
   - skip re-labeling that cluster entirely (saves LLM time)
   Unmatched new clusters: get fresh labels from the LLM pass and the next free
   `color_index`. Unmatched old clusters: simply absent from the new run.

Optional cheap path for frequent small updates: assign new posts to existing
centroids (one cosine pass, no re-clustering) and only do a full warm-started
re-run when >10–20% of posts are new or mean assignment similarity degrades.

## Out of scope / explicitly rejected

- Re-clustering or re-labeling per date range (labels are properties of the
  global clustering; drill-down is a filter).
- Per-cluster labeling prompts (loses contrastive signal, pays prefill k times).
- Using 26B-MOE for labels (wrong tradeoff, see above).
- Any clustering/labeling math in the browser. The UI renders stored results.
- Cloud LLM APIs. The whole point is the local E4B does this for free in <1 min.

## Implementation order

1. Schema + `cluster` CLI command with best-of-N k-means, persistence, and
   centroid-post labels (no LLM yet). API switched to read path. UI unchanged.
2. LLM labeling pass + QA loop + `label_source`.
3. Warm-start + centroid matching for re-ingest stability.
4. UI polish: grey misc streams, stable colors via `color_index`, label_source
   indicator if desired.

Each step ships independently and improves on the status quo.
