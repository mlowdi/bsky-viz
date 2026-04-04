export interface RawRecord {
  collection: string;
  rkey: string;
  record: any;
}

export async function parseCarRecords(carBytes: Uint8Array): Promise<{ records: RawRecord[]; commitCid: string }> {
  throw new Error('stub');
}
