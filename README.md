# bsky-viz — ATproto repo metadata analyzer and visualizer for Bluesky

## What is this?
bsky-viz fetches a Bluesky user's full repository, stores record metadata locally in SQLite, and serves interactive visualizations of their activity. It provides detailed insights into posting habits, interaction networks, and social graph changes over time.

## Requirements
- [Bun runtime](https://bun.sh/)
- No other system dependencies are needed.

## Installation

```bash
git clone https://github.com/mlowdi/bsky-viz.git
cd bsky-viz
bun install
cd ui
bun install
```

## Usage

1. Ingest a repo:
   ```bash
   bun run cli.ts ingest <did-or-handle>
   ```

2. Start the server:
   ```bash
   bun run cli.ts serve
   ```

3. (Optional) Generate embeddings:
   ```bash
   bun run cli.ts embed <did-or-handle> [--model snowflake-arctic-embed2] [--batch-size 50] [--url http://localhost:11434]
   ```

4. Open the UI at `http://localhost:3000`

## Features
- Activity heatmap (day x hour, Monday-first, timezone selector)
- Activity timeline (stacked area, original posts vs replies)
- Content breakdown (pie chart)
- Top interactions (stacked bars with All/Replies/Reposts/Likes filter)
- Social graph timeline (follows and blocks over time)
- Date range drill-down (All Time to Year to Month)
- DID-to-handle resolution with caching

## Tech Stack
- Bun
- Hono
- SQLite (bun:sqlite)
- ECharts
- TypeScript

## License
MIT
