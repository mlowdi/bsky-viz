import { CarReader } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';

export interface RawRecord {
  collection: string; // e.g. 'app.bsky.feed.post'
  rkey: string;       // e.g. '3abc123'
  record: any;        // decoded CBOR object
}

export async function parseCarRecords(carBytes: Uint8Array): Promise<{ records: RawRecord[]; commitCid: string }> {
  const reader = await CarReader.fromBytes(carBytes);
  const roots = await reader.getRoots();
  if (roots.length === 0) {
    throw new Error('No roots found in CAR file');
  }

  const commitCid = roots[0].toString();
  const blocks = new Map<string, Uint8Array>();
  for await (const { cid, bytes } of reader.blocks()) {
    blocks.set(cid.toString(), bytes);
  }

  const commitBlock = blocks.get(commitCid);
  if (!commitBlock) {
    throw new Error(`Commit block not found: ${commitCid}`);
  }

  const commit = dagCbor.decode(commitBlock) as any;
  const mstRootCid = commit.data.toString();
  const records: RawRecord[] = [];

  const decoder = new TextDecoder();

  async function walkMst(nodeCid: string, lastKey: string = '') {
    const nodeBlock = blocks.get(nodeCid);
    if (!nodeBlock) {
      throw new Error(`MST node block not found: ${nodeCid}`);
    }

    const node = dagCbor.decode(nodeBlock) as any;

    // Visit left subtree if it exists
    if (node.l) {
      await walkMst(node.l.toString(), lastKey);
    }

    let currentLastKey = lastKey;

    // Visit entries
    for (const entry of (node.e || [])) {
      // Key reconstruction:
      // p: number of chars shared with previous key
      // k: Uint8Array of the remaining chars after the shared prefix
      const prefix = currentLastKey.slice(0, entry.p);
      const suffix = decoder.decode(entry.k);
      const key = prefix + suffix;
      currentLastKey = key;

      // Yield record at v
      const recordBlock = blocks.get(entry.v.toString());
      if (recordBlock) {
        const record = dagCbor.decode(recordBlock);
        const [collection, rkey] = key.split('/');
        if (collection && rkey) {
          records.push({ collection, rkey, record });
        }
      }

      // Visit right subtree if it exists
      if (entry.t) {
        await walkMst(entry.t.toString(), currentLastKey);
      }
    }
  }

  await walkMst(mstRootCid);

  return { records, commitCid };
}
