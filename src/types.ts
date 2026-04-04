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
