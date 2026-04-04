export const COLORS: Record<string, string> = {
  'original_post': '#339af0',
  'reply': '#845ef7',
  'app.bsky.feed.like': '#ff6b6b',
  'app.bsky.feed.repost': '#51cf66',
  'app.bsky.graph.follow': '#22b8cf',
  'app.bsky.graph.block': '#ff922b',
  'app.bsky.feed.post': '#339af0',
};

export const LABELS: Record<string, string> = {
  'original_post': 'Original Posts',
  'reply': 'Replies',
  'app.bsky.feed.like': 'Likes',
  'app.bsky.feed.repost': 'Reposts',
  'app.bsky.graph.follow': 'Follows',
  'app.bsky.graph.block': 'Blocks',
  'app.bsky.feed.post': 'Posts',
};

export function getColor(collection: string): string {
  return COLORS[collection] || '#868e96'; // default gray
}

export function getLabel(collection: string): string {
  return LABELS[collection] || collection;
}
