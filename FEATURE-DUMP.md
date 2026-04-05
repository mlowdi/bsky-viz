# Planned, Suggested, and Otherwise Possible Features

## Shipped
- ~~Topic cluster explorer~~ — click ThemeRiver stream to view posts (PR #11)
- ~~ThemeRiver display toggle~~ — proportional vs volume (PR #10)
- ~~Embedding status indicator~~ — shows CLI command when missing (PR #9)
- ~~Timestamp clamping~~ — pre-2023 and future records quarantined to anachronisms view (PR #13, #14)
- ~~Heatmap collection filter~~ — tab switcher for All/Posts+Replies/Likes/Reposts/Follows/Blocks (PR #15)
- ~~Typical day profile~~ — 24h stacked bar by action type, timezone-aware (PR #16)
- ~~Sleep window detection~~ — longest daily gap plotted over time, midnight-wrapping, 16h cap, timezone-aware

## Wave 2: Anomaly Detection

### Activity burst detection with trigger identification
Compute rolling baseline (7-day moving average of daily events). Flag windows exceeding 2-3 sigma. For each burst, surface the *first action* in the window — that's the trigger. "You liked a post, then spent 4 hours reply-threading." Also surface the inverse: sudden silences after consistent activity.

### Rhythm stability / entropy score
How consistent is someone's daily pattern week-over-week? Compute entropy of hourly activity distribution. High entropy = chaotic poster (or bot). Low entropy = creature of habit. Autocorrelation of hourly activity signal reveals periodicity — humans are strongly 24h-periodic, bots often aren't.

### Topic-burst correlation
Combine burst detection with cluster embeddings. When you burst, what *topic* triggered it? "You have 3x higher engagement when the topic is AI." "Your block events cluster around political content." The reach-through meeting the time series.

## Wave 3: Cross-Account Analysis (needs architecture work)

### Reply latency distribution
For reply posts, compute time delta from parent post timestamp. Requires fetching parent post data (may need to ingest the parent's repo or query the AppView API). Fast repliers vs slow-burners have very different distributions. Histogram + median/p95 stats.

### "What sets you off" — reaction chain analysis
Identify sequences: user sees content → reacts (like/repost) → creates content (post/reply). Requires parent post context + embeddings of the triggering content. Could reveal unconscious patterns: "every time someone posts about X, you write a thread about Y."

### Cross-repo behavioral comparison
Compare activity signatures across ingested repos. Similarity scoring on daily rhythms, content ratios, interaction patterns. "This account behaves like a bot" vs "This account behaves like your average European timezone poster."

## Polish / QoL (issue #12)
- Cluster explorer timestamps should use 24h format
- Embedding status should account for media-only posts that can't be embedded
- Consider extracting the modal pattern (used in cluster explorer, anachronisms) into a shared utility

## Future Architecture Considerations
- If analysis gets heavy enough, consider rewrite in Go or Rust for real performance
- Parent post fetching would require either multi-repo ingestion or AppView API queries
- Embedding cross-account content opens up much richer analysis but significantly increases data requirements
