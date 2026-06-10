# bsky-viz — ATproto repo metadata analyzer and visualizer for Bluesky

## What is this?
bsky-viz fetches a Bluesky user's full repository, stores record metadata locally in SQLite, and serves interactive visualizations of their activity. It provides detailed insights into posting habits, interaction networks, social graph changes over time, and — with local LLM features enabled — a semantically clustered "topic river" of what the account actually posts about.

## Requirements
- [Bun runtime](https://bun.sh/)
- For the metadata visualizations: nothing else.
- For the optional LLM features (embeddings + topic clustering):
  - [llama.cpp](https://github.com/ggml-org/llama.cpp) `llama-server` binaries (a precompiled Vulkan release works fine), location via `LLAMACPP_DIR`
  - Two GGUF models in a directory pointed to by `BSKYVIZ_GGUF_DIR`:
    - `snowflake-arctic-embed-l-v2.0-q8_0.gguf` (embeddings, ~635 MB — use an HF conversion; ollama's blob is not loadable by upstream llama.cpp)
    - `gemma-4-E4B_q4_0-it.gguf` (cluster labeling, ~5 GB)

  bsky-viz spawns, swaps and tears down its own `llama-server` (port 8092, `BSKYVIZ_LLAMA_PORT`); there is no daemon to run.

## Installation

```bash
git clone https://github.com/mlowdi/bsky-viz.git
cd bsky-viz
bun install
cd ui
bun install
```

## Usage

The one-command path:

```bash
bun run cli.ts process <did-or-handle>   # ingest + embed + cluster
bun run cli.ts serve                     # UI at http://localhost:3000
```

`process` always re-fetches the repo, embeds only posts that lack embeddings, and re-clusters with warm-started centroids — so re-running it on an already-processed repo takes seconds and keeps cluster labels and colors stable.

Or step by step:

1. Ingest a repo (metadata only, no LLM needed):
   ```bash
   bun run cli.ts ingest <did-or-handle> [--refresh]
   ```

2. Generate embeddings:
   ```bash
   bun run cli.ts embed <did-or-handle> [--batch-size 50] [--url <openai-compatible-base>]
   ```
   `--url` points at an external `/v1/embeddings` endpoint instead of the managed server.

3. Cluster + label:
   ```bash
   bun run cli.ts cluster <did-or-handle> [--k 10]
   ```
   Persists the clustering, then labels each cluster with a single contrastive LLM pass (labels are QA-checked against cluster geometry; failures retry once, then fall back to the nearest-centroid post). Re-runs warm-start from previous centroids and inherit labels for matching clusters.

4. Start the server:
   ```bash
   bun run cli.ts serve
   ```

5. Open the UI at `http://localhost:3000`

## Features
- Activity heatmap (day x hour, Monday-first, timezone selector)
- Activity timeline (stacked area, original posts vs replies)
- Content breakdown (pie chart)
- Topic themeriver: semantic post clusters over time, LLM-labeled, stable colors across re-runs, low-coherence clusters greyed as "Misc"
- Top interactions (stacked bars with All/Replies/Reposts/Likes filter)
- Social graph timeline (follows and blocks over time)
- Date range drill-down (All Time to Year to Month) — filters the views; never re-clusters
- DID-to-handle resolution with caching
- Anachronistic timestamp handling: client-supplied dates outside [2023, today] are counted at ingest, surfaced in the UI, and kept off the time axes

## Tech Stack
- Bun
- Hono
- SQLite (bun:sqlite)
- ECharts
- TypeScript
- llama.cpp (Vulkan) for local inference — no cloud APIs

## License
MIT
