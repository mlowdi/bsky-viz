# bsky-viz Codebase Map

## 1. File Documentation

### Root Files
- **`cli.ts`**
  - **Purpose:** The entry point for the application to handle CLI commands (`ingest` to fetch repo data and `serve` to run the web interface).
  - **Key exports/functions:** None (executable script).
  - **Local Dependencies:** `src/db/schema.js`, `src/ingest/fetch.js`, `src/ingest/parse.js`, `src/ingest/normalize.js`, `src/db/queries.js`, `src/resolve.js`, `src/server/index.js`.
  - **External Dependencies:** None.
- **`package.json`**
  - **Purpose:** Defines project metadata, scripts, and dependencies for the backend.
  - **Dependencies:** `@ipld/car`, `@ipld/dag-cbor`, `hono`, `multiformats`, `typescript`, `@types/bun`.
- **`tsconfig.json`**
  - **Purpose:** TypeScript compiler configuration for the backend codebase.

### Backend (`src/`)
- **`src/types.ts`**
  - **Purpose:** Defines the shared TypeScript interfaces and types used across the application.
  - **Key exports:** `Collection`, `RepoRow`, `RecordRow`, `HeatmapCell`, `TimelinePoint`, `InteractionPartner`, `RatioData`, `SocialEvent`.
  - **Local Dependencies:** None.
  - **External Dependencies:** None.
- **`src/db/schema.ts`**
  - **Purpose:** Initializes the SQLite database and defines the schema tables and indexes.
  - **Key exports:** `initDatabase`.
  - **Local Dependencies:** None.
  - **External Dependencies:** `bun:sqlite`.
- **`src/db/queries.ts`**
  - **Purpose:** Provides helper functions for inserting and querying repository and record data in the database.
  - **Key exports:** `upsertRepo`, `insertRecordBatch`, `getRepos`, `getRepo`, `getRecordCount`, `getCachedHandle`, `getCachedHandles`, `cacheHandle`.
  - **Local Dependencies:** `../types.js`.
  - **External Dependencies:** `bun:sqlite`.
- **`src/resolve.ts`**
  - **Purpose:** Resolves Bluesky DIDs to handles by querying the public AppView and utilizing local caching.
  - **Key exports:** `resolveHandles`.
  - **Local Dependencies:** `./db/queries.js`.
  - **External Dependencies:** `bun:sqlite`.
- **`src/ingest/fetch.ts`**
  - **Purpose:** Resolves handles to DIDs, discovers PDS endpoints, and downloads CAR files containing repository data.
  - **Key exports:** `resolveDidOrHandle`, `discoverPds`, `fetchCarBytes`, `fetchRepo`.
  - **Local Dependencies:** None.
  - **External Dependencies:** None.
- **`src/ingest/parse.ts`**
  - **Purpose:** Parses raw CAR files into decodable MST trees and extracts raw ATproto records.
  - **Key exports:** `parseCarRecords`.
  - **Local Dependencies:** None.
  - **External Dependencies:** `@ipld/car`, `@ipld/dag-cbor`, `multiformats/cid`.
- **`src/ingest/normalize.ts`**
  - **Purpose:** Normalizes raw ATproto records into standardized rows for database insertion.
  - **Key exports:** `normalizeRecords`.
  - **Local Dependencies:** `../types.js`, `./parse.js`.
  - **External Dependencies:** None.
- **`src/analysis/activity.ts`**
  - **Purpose:** Aggregates database record data to power the activity heatmap and timeline visualizations.
  - **Key exports:** `getActivityHeatmap`, `getActivityTimeline`.
  - **Local Dependencies:** `../types.js`.
  - **External Dependencies:** `bun:sqlite`.
- **`src/analysis/interactions.ts`**
  - **Purpose:** Analyzes user interactions (likes, reposts, replies) to identify top interaction partners and content ratios.
  - **Key exports:** `getTopInteractions`, `getContentRatios`.
  - **Local Dependencies:** `../types.js`.
  - **External Dependencies:** `bun:sqlite`.
- **`src/analysis/social.ts`**
  - **Purpose:** Extracts chronologically ordered timelines for follow and block graph events.
  - **Key exports:** `getFollowTimeline`, `getBlockTimeline`.
  - **Local Dependencies:** `../types.js`.
  - **External Dependencies:** `bun:sqlite`.
- **`src/server/index.ts`**
  - **Purpose:** Creates and configures the Hono web server to serve the API and static UI files.
  - **Key exports:** `createApp`.
  - **Local Dependencies:** `./routes/api.js`.
  - **External Dependencies:** `hono`, `hono/bun`, `bun:sqlite`.
- **`src/server/routes/api.ts`**
  - **Purpose:** Defines the RESTful API endpoints that expose database queries and analysis functions to the frontend.
  - **Key exports:** `apiRoutes`.
  - **Local Dependencies:** `../../analysis/activity.js`, `../../analysis/interactions.js`, `../../analysis/social.js`, `../../db/queries.js`, `../../resolve.js`.
  - **External Dependencies:** `hono`, `bun:sqlite`.

### Frontend (`ui/` and `ui/src/`)
- **`ui/package.json`**
  - **Purpose:** Defines project metadata, scripts, and dependencies for the frontend UI.
  - **Dependencies:** `echarts`, `vite`, `typescript`.
- **`ui/tsconfig.json`**
  - **Purpose:** TypeScript compiler configuration for the frontend UI codebase.
- **`ui/vite.config.ts`**
  - **Purpose:** Vite configuration for bundling the UI and proxying API requests to the backend.
- **`ui/src/main.ts`**
  - **Purpose:** The main entry point for the frontend, orchestrating data fetching and rendering of visualization charts.
  - **Key exports:** None (runs script directly).
  - **Local Dependencies:** `./charts/activity-heatmap.js`, `./charts/timeline.js`, `./charts/ratios.js`, `./charts/interaction-network.js`, `./charts/social-timeline.js`.
  - **External Dependencies:** None.
- **`ui/src/charts/activity-heatmap.ts`**
  - **Purpose:** Renders a heatmap chart visualizing user activity by day of the week and hour using ECharts.
  - **Key exports:** `renderHeatmap`.
  - **External Dependencies:** `echarts`.
- **`ui/src/charts/interaction-network.ts`**
  - **Purpose:** Renders a horizontal bar chart displaying top interaction partners using ECharts.
  - **Key exports:** `renderInteractions`.
  - **External Dependencies:** `echarts`.
- **`ui/src/charts/ratios.ts`**
  - **Purpose:** Renders a pie chart displaying the relative proportions of different content types using ECharts.
  - **Key exports:** `renderRatios`.
  - **External Dependencies:** `echarts`.
- **`ui/src/charts/social-timeline.ts`**
  - **Purpose:** Renders a line chart visualizing cumulative follow and block events over time using ECharts.
  - **Key exports:** `renderSocial`.
  - **External Dependencies:** `echarts`.
- **`ui/src/charts/timeline.ts`**
  - **Purpose:** Renders an area line chart showing activity volume over time grouped by collection using ECharts.
  - **Key exports:** `renderTimeline`.
  - **External Dependencies:** `echarts`.

## 2. Full Data Flow
- **CLI Ingestion**:
  - The user runs `bun run cli.ts ingest <did-or-handle>`.
  - `src/ingest/fetch.ts` resolves the given identifier to a DID, discovers the corresponding PDS endpoint, and downloads the raw CAR file bytes.
  - `src/ingest/parse.ts` processes the CAR file using IPLD utilities to decode the DAG-CBOR payload, walks the Merkle Search Tree (MST), and extracts the ATproto records.
  - `src/ingest/normalize.ts` transforms the dynamic record data into structured arrays, extracting specific identifiers (e.g., `subject_did`, `reply_parent_did`).
  - `src/db/queries.ts` saves the repository metadata and batches of records into the SQLite database (`bsky-viz.sqlite`).
- **Server**:
  - The user runs `bun run cli.ts serve`.
  - `src/server/index.ts` sets up a Hono web server which proxies `/api` endpoints via `src/server/routes/api.ts` and serves UI files from `ui/dist`.
  - The API queries the database, aggregating metrics instantly via the files in `src/analysis/`.
- **UI**:
  - Upon visiting the application, `ui/src/main.ts` interacts with the user inputs.
  - It fetches multiple endpoints asynchronously (e.g., summary, heatmap, timeline, interactions).
  - Data points are subsequently passed to visualization functions located in `ui/src/charts/` that populate respective ECharts UI containers.

## 3. Database Schema

**`repos`**
- `did TEXT PRIMARY KEY`
- `handle TEXT`
- `display_name TEXT`
- `fetched_at INTEGER NOT NULL`
- `commit_cid TEXT`

**`records`**
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `repo_did TEXT NOT NULL`
- `collection TEXT NOT NULL`
- `rkey TEXT NOT NULL`
- `created_at INTEGER`
- `indexed_at INTEGER NOT NULL`
- `subject_did TEXT`
- `subject_uri TEXT`
- `is_reply INTEGER`
- `reply_parent_did TEXT`
- `reply_root_did TEXT`
- `text_length INTEGER`
- `embed_type TEXT`
- `raw_json TEXT`
- `embedding BLOB`
- *UNIQUE Constraint on `(repo_did, collection, rkey)`*

**`handle_cache`**
- `did TEXT PRIMARY KEY`
- `handle TEXT NOT NULL`
- `resolved_at INTEGER NOT NULL`

**Indexes:**
- `idx_records_repo_collection` on `records(repo_did, collection)`
- `idx_records_created_at` on `records(created_at)`
- `idx_records_subject_did` on `records(subject_did)`

## 4. API Endpoints

- **`GET /api/repos`**
  - **Response:** Array of `{ did: string, handle: string | null, display_name: string | null, fetched_at: number, commit_cid: string | null }`
- **`GET /api/resolve-handles?dids=did1,did2`**
  - **Response:** Record object mapping DIDs to handles, e.g., `{ "did1": "handle1" }`
- **`GET /api/repos/:did/summary`**
  - **Response:** `{ did, handle, display_name, fetched_at, commit_cid, counts: Record<string, number> }` or `404 { error: 'Repo not found' }`
- **`GET /api/repos/:did/activity/heatmap?collection=optional_filter`**
  - **Response:** Array of `{ dayOfWeek: number, hourOfDay: number, count: number }`
- **`GET /api/repos/:did/activity/timeline`**
  - **Response:** Array of `{ date: string, collection: string, count: number }`
- **`GET /api/repos/:did/ratios`**
  - **Response:** Array of `{ collection: string, count: number }`
- **`GET /api/repos/:did/interactions/top?limit=20`**
  - **Response:** Array of `{ did: string, collection: string, count: number, handle: string | null }`
- **`GET /api/repos/:did/social/follows`**
  - **Response:** Array of `{ created_at: number, collection: string, subject_did: string }`
- **`GET /api/repos/:did/social/blocks`**
  - **Response:** Array of `{ created_at: number, collection: string, subject_did: string }`

## 5. Project Status

- **What works**:
  - The complete pipeline of resolving ATproto DIDs/handles, discovering PDS sources, and downloading CAR blobs.
  - Successfully parsing IPLD/DAG-CBOR formats, walking MST, and unpacking repo trees.
  - Standardized normalization and SQL ingestion.
  - Fast, Hono-powered API server serving raw analytical abstractions.
  - Rich frontend integration that effectively renders ECharts using parallel data fetching pipelines.
  - Handle resolution caching mechanisms.
- **Incomplete / TODO**:
  - The `embedding` field in the `records` table is defined as a `BLOB` but explicitly filled with `null` during `normalize.ts` (needs an embedding generator).
  - Input validation is sparse: error responses heavily depend on passing errors directly via generic exception catchers onto the UI.
  - CLI `ingest` processes function autonomously from the webserver. An automatic UI refresh logic via WebSockets or long polling is not currently implemented.
- **Known Issues**:
  - Truncation on DIDs within `interaction-network.ts` slices to 20 chars (`d.did.slice(0, 20) + '...'`).
  - SQLite uses local time functions (`unixepoch`) directly querying the backend OS timezone without applying offset compensation corresponding directly to the users. Activity heatmaps may display improperly to clients browsing outside the host server's timezone.