# Planned, Suggested, and Otherwise Possible Features

## Shipped
- ~~Topic cluster explorer~~ — click ThemeRiver stream to view posts (PR #11)
- ~~ThemeRiver display toggle~~ — proportional vs volume (PR #10)
- ~~Embedding status indicator~~ — shows CLI command when missing (PR #9)
- ~~Timestamp clamping~~ — pre-2023 and future records quarantined to anachronisms view (PR #13, #14)
- ~~Heatmap collection filter~~ — tab switcher for All/Posts+Replies/Likes/Reposts/Follows/Blocks (PR #15)
- ~~Typical day profile~~ — 24h stacked bar by action type, timezone-aware (PR #16)
- ~~Sleep window detection~~ — longest daily gap plotted over time, midnight-wrapping, 16h cap, timezone-aware

## Wave 1.5: Post Length as Behavioral Mode Detection

### Core idea
Post length (in graphemes, not chars — emojis and unicode matter) is a cheap proxy for behavioral mode. Short = shitpost/reaction. Long = thesis or argument. Cross it with time-of-day and post type for a full behavioral taxonomy:

- **Short original** = shitpost mode
- **Short reply** = chaos gremlin mode
- **Long original** = thesis mode
- **Long reply** = argument mode

### Implementation plan

**Backend:** New analysis function that returns average post length by hour (using the `text_length` field already in the DB — but verify it's grapheme count not byte/char count; may need to recompute with `Intl.Segmenter` at ingest or query time). Group by hour, split by original_post vs reply. Return: `Array<{ hour: number, type: 'original'|'reply', avgLength: number, count: number }>`.

**Viz 1: Length x Time heatmap or line chart.** X-axis hours, Y-axis average grapheme count. Two series: originals and replies. Late night should show bimodal distribution (very short OR very long, not much middle).

**Viz 2: Behavioral mode quadrant.** Scatter or density plot: x-axis = length, y-axis = hour. Color by type (original vs reply). Four quadrants labeled: shitpost, chaos gremlin, thesis, argument. The user sees where their posts cluster.

**Viz 3 (advanced): Mode x Topic crossover.** Overlay behavioral modes against embedding clusters. "When you're in thesis mode, what are you writing about?" vs "When you're in chaos gremlin mode, what topics bring that out?" This connects the length proxy to semantic content — requires both `text_length` and `embedding` to be populated.

### Data consideration
The existing `text_length` field in the records table may be char count not grapheme count. Grapheme counting matters for emoji-heavy posts (one emoji = 1 grapheme but potentially 4+ bytes / 2+ chars). Either:
- Add a `grapheme_length` field and compute during ingestion using `Intl.Segmenter`
- Compute on-the-fly from `raw_json` text at query time (slower but no schema change)
- Accept char count as "close enough" for v1 and note the limitation

### Why this is exciting
It's the simplest possible content analysis that doesn't require embeddings. Everyone can use it immediately. And it reveals behavioral modes that even the user probably doesn't know about — "I had no idea I write 3x longer posts at 11pm" is a genuine self-knowledge moment.

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
