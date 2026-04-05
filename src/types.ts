export type Collection =
  | 'app.bsky.feed.post'
  | 'app.bsky.feed.like'
  | 'app.bsky.feed.repost'
  | 'app.bsky.feed.threadgate'
  | 'app.bsky.feed.postgate'
  | 'app.bsky.graph.follow'
  | 'app.bsky.graph.block'
  | 'app.bsky.graph.list'
  | 'app.bsky.graph.listitem'
  | 'app.bsky.graph.listblock'
  | 'app.bsky.actor.profile';

export interface RepoRow {
  did: string;
  handle: string | null;
  display_name: string | null;
  fetched_at: number;
  commit_cid: string | null;
}

export interface RecordRow {
  id?: number;
  repo_did: string;
  collection: Collection;
  rkey: string;
  created_at: number | null;
  indexed_at: number;
  subject_did: string | null;
  subject_uri: string | null;
  is_reply: number | null;
  reply_parent_did: string | null;
  reply_root_did: string | null;
  text_length: number | null;
  embed_type: string | null;
  raw_json: string | null;
  embedding: Uint8Array | null;
}

export interface HeatmapCell {
  dayOfWeek: number;
  hourOfDay: number;
  count: number;
}

export interface TypicalDayPoint {
  hour: number;
  collection: string;
  count: number;
}

export interface TimelinePoint {
  date: string;
  collection: string;
  count: number;
}

export interface InteractionPartner {
  did: string;
  collection: string;
  count: number;
}

export interface RatioData {
  collection: string;
  count: number;
}

export interface SocialEvent {
  created_at: number;
  collection: string;
  subject_did: string;
}

export interface ClusterPost {
  clusterId: number;
  text: string;
  createdAt: number;
}

export interface ClusterAnalysis {
  clusters: Array<{ id: number; label: string }>;
  series: Array<{ date: string; clusterId: number; count: number }>;
  posts: ClusterPost[];
}

export interface SleepWindow {
  date: string;
  gapStartHour: number;
  gapEndHour: number;
  gapMinutes: number;
}
