# bsky-viz: ATproto Repository Visualizer

A TypeScript/Bun tool that fetches an ATproto user's full repo, extracts all record metadata, stores it in SQLite, and serves interactive visualizations via a web UI.

## Goals
- **Input**: ATproto DID or handle.
- **Fetch**: Entire repo as CAR file via `com.atproto.sync.getRepo`.
- **Parse**: All record types (metadata only — no blob/media download in v1).
- **Store**: SQLite for fast repeated queries.
- **Serve**: A web UI with interactive charts/graphs.
- **Extensibility**: Designed for future content analysis, semantic embeddings, and temporal correlation queries.

## Tech Stack
- **Runtime**: Bun (not Node)
- **Language**: TypeScript
- **CAR parsing**: `@ipld/car` + `@ipld/dag-cbor` for CARv1 CBOR blocks, or `@atproto/repo` from the official atproto monorepo.
- **HTTP client**: Native `fetch` (Bun built-in).
- **Database**: `bun:sqlite` (built-in to Bun, zero extra deps).
- **Backend server**: Hono (lightweight, TypeScript-native).
- **Frontend**: Vite + TypeScript.
- **Charts**: ECharts (rich time-series, heatmaps, graph charts).
- **Handle resolution**: `com.atproto.identity.resolveHandle` XRPC endpoint.

## ATproto Record Types to Capture
All records are extracted from the user's repo CAR file:
- `app.bsky.feed.post` — Posts and replies (createdAt, text length, reply parent/root DIDs, embed type, langs, facet count).
- `app.bsky.feed.like` — Likes (createdAt, subject URI/CID — contains target DID).
- `app.bsky.feed.repost` — Reposts (createdAt, subject URI/CID — contains target DID).
- `app.bsky.feed.threadgate` — Thread gate rules (createdAt).
- `app.bsky.feed.postgate` — Post gate rules (createdAt).
- `app.bsky.graph.follow` — Follows (createdAt, subject DID).
- `app.bsky.graph.block` — Blocks (createdAt, subject DID).
- `app.bsky.graph.list` — Lists (createdAt, name, purpose).
- `app.bsky.graph.listitem` — List memberships (createdAt, subject DID, list URI).
- `app.bsky.graph.listblock` — List-level blocks (createdAt, subject list URI).
- `app.bsky.actor.profile` — Profile snapshot (displayName, description length, avatar/banner presence).

## SQLite Schema Design

### `repos` table
```sql
CREATE TABLE repos (
  did TEXT PRIMARY KEY,
  handle TEXT,
  display_name TEXT,
  fetched_at INTEGER NOT NULL,
  commit_cid TEXT
);
```

### `records` table (unified, extensible)
```sql
CREATE TABLE records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_did TEXT NOT NULL,
  collection TEXT NOT NULL,
  rkey TEXT NOT NULL,
  created_at INTEGER,
  indexed_at INTEGER NOT NULL,
  subject_did TEXT,
  subject_uri TEXT,
  is_reply INTEGER,
  reply_parent_did TEXT,
  reply_root_did TEXT,
  text_length INTEGER,
  embed_type TEXT,
  raw_json TEXT,
  embedding BLOB,
  UNIQUE(repo_did, collection, rkey)
);
CREATE INDEX idx_records_repo_collection ON records(repo_did, collection);
CREATE INDEX idx_records_created_at ON records(created_at);
CREATE INDEX idx_records_subject_did ON records(subject_did);
```

## Project Structure
```
bsky-viz/
  src/
    ingest/
      fetch.ts        -- fetch CAR from PDS, handle DID/handle resolution
      parse.ts        -- walk CAR MST, extract records by collection
      normalize.ts    -- normalize each record type into DB row shape
    db/
      schema.ts       -- CREATE TABLE statements, migration runner
      queries.ts      -- typed query functions
    server/
      index.ts        -- Hono app, static file serving
      routes/
        api.ts        -- REST endpoints for chart data
    analysis/
      activity.ts     -- time-of-day, day-of-week, timeline aggregations
      interactions.ts -- top reply targets, repost targets, like targets
      social.ts       -- follow/unfollow/block patterns
  ui/
    index.html
    src/
      main.ts         -- app entrypoint
      charts/
        activity-heatmap.ts
        timeline.ts
        interaction-network.ts
        ratios.ts
  cli.ts              -- CLI entrypoint
  package.json
  tsconfig.json
```

## CLI Interface
```bash
bun run cli.ts ingest <did-or-handle> [--refresh]
bun run cli.ts serve [--port 3000]
```

## API Endpoints (Hono)
- `GET /api/repos`
- `GET /api/repos/:did/activity/heatmap`
- `GET /api/repos/:did/activity/timeline`
- `GET /api/repos/:did/ratios`
- `GET /api/repos/:did/interactions/top`
- `GET /api/repos/:did/social/follows`
- `GET /api/repos/:did/social/blocks`

## v1 Visualizations
1. **Activity heatmap** (24x7 grid, selectable record type).
2. **Activity timeline** (records per day by type).
3. **Content ratio** (original posts vs replies vs reposts).
4. **Top interaction partners** (reply-to, like, repost targets).
5. **Social graph timeline** (follows/blocks over time).
6. **Account summary stat cards**.

## v2 / Future Hooks
- **Semantic embeddings**: Via LAN endpoint (Arctic Snowflake, 2000 char limit) stored in `records.embedding`.
- **Content/sentiment analysis**: Using `raw_json`.
- **Temporal correlation queries**: (e.g., "blocks within 30min of a reply").
- **Blob/media download**: Add `blobs` table.
- **Multi-account comparison**.
- **Export**: CSV/JSON.

## Key Implementation Notes
- **CAR parsing**: Fetch raw bytes from `GET https://{pds}/xrpc/com.atproto.sync.getRepo?did={did}`, parse with `@ipld/car CarReader`, decode blocks with `@ipld/dag-cbor`, walk MST. Record keys are `collection/rkey`.
- **PDS discovery**: Resolve DID document. For `did:plc` use `https://plc.directory/{did}`. For `did:web` use `https://{domain}/.well-known/did.json`. Extract `#atproto_pds` service endpoint.
- **Handle resolution**: `GET https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle={handle}`.
- **bun:sqlite**: `import { Database } from 'bun:sqlite'` — zero extra deps.
- **All timestamps stored as UTC unix ms**. UI lets user configure display timezone.
