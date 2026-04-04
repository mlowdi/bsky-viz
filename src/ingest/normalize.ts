import type { RecordRow, Collection } from '../types.js';
import type { RawRecord } from './parse.js';

// The known collections we extract metadata from:
const KNOWN_COLLECTIONS = new Set<Collection>([
  'app.bsky.feed.post', 
  'app.bsky.feed.like', 
  'app.bsky.feed.repost',
  'app.bsky.feed.threadgate', 
  'app.bsky.feed.postgate',
  'app.bsky.graph.follow', 
  'app.bsky.graph.block',
  'app.bsky.graph.list', 
  'app.bsky.graph.listitem', 
  'app.bsky.graph.listblock',
  'app.bsky.actor.profile'
]);

// Extract DID from AT-URI: 'at://did:plc:abc123/app.bsky.feed.post/xyz' → 'did:plc:abc123'
function extractDidFromUri(uri: string): string | null {
  const match = uri.match(/^at:\/\/(did:[^/]+)/);
  return match ? match[1] : null;
}

export function normalizeRecords(did: string, rawRecords: RawRecord[]): RecordRow[] {
  const normalized: RecordRow[] = [];
  const now = Date.now();

  for (const raw of rawRecords) {
    if (!KNOWN_COLLECTIONS.has(raw.collection as Collection)) {
      console.warn(`Unknown record type: ${raw.collection}`);
      continue;
    }

    const { collection, rkey, record } = raw;
    const createdAt = record.createdAt ? new Date(record.createdAt).getTime() : null;

    const row: RecordRow = {
      repo_did: did,
      collection: collection as Collection,
      rkey,
      created_at: createdAt,
      indexed_at: now,
      subject_did: null,
      subject_uri: null,
      is_reply: null,
      reply_parent_did: null,
      reply_root_did: null,
      text_length: null,
      embed_type: null,
      raw_json: JSON.stringify(record),
      embedding: null
    };

    switch (collection) {
      case 'app.bsky.feed.post':
        row.text_length = record.text?.length || 0;
        if (record.reply) {
          row.is_reply = 1;
          row.reply_parent_did = extractDidFromUri(record.reply.parent?.uri || '');
          row.reply_root_did = extractDidFromUri(record.reply.root?.uri || '');
        } else {
          row.is_reply = 0;
        }
        row.embed_type = record.embed?.$type || null;
        break;

      case 'app.bsky.feed.like':
      case 'app.bsky.feed.repost':
        row.subject_uri = record.subject?.uri || null;
        row.subject_did = extractDidFromUri(record.subject?.uri || '');
        break;

      case 'app.bsky.graph.follow':
      case 'app.bsky.graph.block':
        row.subject_did = record.subject || null;
        break;

      case 'app.bsky.graph.list':
        // Metadata handled in raw_json
        break;

      case 'app.bsky.graph.listitem':
        row.subject_did = record.subject || null;
        row.subject_uri = record.list || null;
        break;

      case 'app.bsky.graph.listblock':
        row.subject_uri = record.subject || null;
        break;

      case 'app.bsky.actor.profile':
        row.text_length = record.description?.length || 0;
        break;
    }

    normalized.push(row);
  }

  return normalized;
}
