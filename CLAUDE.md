# bsky-viz

ATproto metadata analysis tool. Fetches a Bluesky user's full repo, stores record metadata in SQLite, serves interactive ECharts visualizations via Hono web server.

## Quick Start

```bash
bun run cli.ts ingest <did-or-handle>   # fetch + parse + store
bun run cli.ts embed <did-or-handle>    # embed post texts (spawns its own llama-server)
bun run cli.ts cluster <did-or-handle> [--k 10]  # persistent clustering + LLM labels
bun run cli.ts process <did-or-handle> [--k 10]  # ingest (refresh) + embed + cluster in one go
bun run cli.ts serve                     # start server on :3000
```

## Stack

- **Runtime:** Bun (not Node)
- **Backend:** Hono, bun:sqlite
- **Frontend:** Vite + ECharts (dark theme), vanilla TypeScript
- **Ingestion:** @ipld/car, @ipld/dag-cbor, multiformats (CAR parsing, MST walking)
- **Inference:** llama.cpp llama-server (Vulkan), spawned/swapped/torn down by
  `src/llm/host.ts` on port 8092 (`BSKYVIZ_LLAMA_PORT`). GGUFs from
  `~/projects/local-llm/ggufs` (`BSKYVIZ_GGUF_DIR`): arctic-embed-l-v2.0 q8_0
  for embeddings, gemma-4-E4B for cluster labels. NOTE: ollama's arctic blob
  does NOT load in upstream llama.cpp (stale GGUF tokenizer metadata) — use
  the HF conversion. Gemma 4 needs chat_template_kwargs.enable_thinking=false
  (and still leaks reasoning on E4B; budget max_tokens accordingly).
- **No:** Express, better-sqlite3, React, dotenv, ollama

## Architecture

```
cli.ts                  # Entry point: ingest | serve
src/
  types.ts              # Shared interfaces
  resolve.ts            # DID -> handle resolution with SQLite cache
  embed.ts              # post text -> embedding via managed llama-server
  cluster.ts            # persistent k-means + contrastive LLM labeling + QA (see DESIGN-cluster-labeling.md)
  llm/
    host.ts             # ModelHost: spawn/swap/teardown llama-server profiles
  db/
    schema.ts           # initDatabase() — repos, records, handle_cache tables
    queries.ts          # upsertRepo, insertRecordBatch, handle cache helpers
  ingest/
    fetch.ts            # DID resolution, PDS discovery, CAR download
    parse.ts            # CAR -> IPLD -> MST walk -> raw records
    normalize.ts        # Raw records -> typed RecordRow[]
  analysis/
    activity.ts         # getActivityHeatmap, getActivityTimeline
    interactions.ts     # getTopInteractions, getContentRatios
    social.ts           # getFollowTimeline, getBlockTimeline
  server/
    index.ts            # createApp() — Hono setup, static files from ui/dist
    routes/api.ts       # 9 REST endpoints under /api
ui/
  src/
    main.ts             # SPA entry: fetch data, render charts, manage state
    charts/
      activity-heatmap.ts    # Day x Hour heatmap
      timeline.ts            # Activity over time (stacked area)
      ratios.ts              # Content type pie chart
      interaction-network.ts # Top interaction partners (horizontal bar)
      social-timeline.ts     # Cumulative follows/blocks line chart
```

## Database (bsky-viz.sqlite)

- **repos** — did (PK), handle, display_name, fetched_at, commit_cid
- **records** — id (PK), repo_did, collection, rkey, created_at, indexed_at, subject_did, subject_uri, is_reply, reply_parent_did, reply_root_did, text_length, embed_type, raw_json, embedding (BLOB, currently null)
  - UNIQUE(repo_did, collection, rkey)
  - Indexes: repo_collection, created_at, subject_did
- **handle_cache** — did (PK), handle, resolved_at
- **cluster_runs** — id (PK), repo_did, k, params_hash, created_at, is_current
- **clusters** — (run_id, cluster_id) PK, label, label_source ('llm'|'centroid-fallback'|'inherited'), centroid BLOB, coherence, color_index
- **cluster_assignments** — (run_id, record_id) PK, cluster_id, similarity

## API Endpoints

All under `/api`:
- `GET /repos` — list ingested repos
- `GET /repos/:did/summary` — repo metadata + record counts by collection
- `GET /repos/:did/activity/heatmap?collection=` — day x hour counts
- `GET /repos/:did/activity/timeline` — date x collection counts
- `GET /repos/:did/ratios` — collection breakdown
- `GET /repos/:did/interactions/top?limit=20` — top partners with resolved handles
- `GET /repos/:did/social/follows` — follow events timeline
- `GET /repos/:did/social/blocks` — block events timeline
- `GET /repos/:did/clusters?bin=&start=&end=` — pure read of current cluster run; date range filters series, never re-clusters
- `GET /resolve-handles?dids=` — batch DID->handle resolution

## Known Issues / TODOs

- Timezone: backend aggregates in pure UTC (strftime with 'unixepoch'), frontend applies a static integer hour offset. This means: (a) DST is not accounted for — ~1 hour error for half of historical data, (b) fractional timezones (India +5:30, Nepal +5:45) are rounded to nearest hour. Fix would require passing IANA timezone name to backend and aggregating in-memory with Intl.DateTimeFormat instead of SQL GROUP BY.
- No WebSocket/polling for live updates after ingestion
- Input validation is minimal

## Build

```bash
cd ui && bun run build          # build frontend to ui/dist
cd ui && bun build src/main.ts --outdir=dist  # alternative direct build
```

## Development Workflow

- Use `spawn_worker` / `spawn_gemini` for ALL implementation work — Gemini workers are 10-30x cheaper than Opus tokens
- Opus handles planning, task decomposition, spec writing, and architectural decisions only
- `spawn_worker` agents run in the main directory (no isolation) for simple edits, or use `spawn_gemini` for worktree-isolated changes
- Stale worktrees and branches should be cleaned after merging
