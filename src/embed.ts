import { Database } from 'bun:sqlite';
import { updateEmbedding, getPostsWithoutEmbeddings } from './db/queries.js';

async function embedBatch(texts: string[], model: string, baseUrl: string): Promise<number[][] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts })
    });

    if (!res.ok) {
      console.error(`Ollama API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as any;
    return data.embeddings || null;
  } catch (err) {
    console.error(`Failed to embed texts:`, err);
    return null;
  }
}

export async function embedTexts(texts: string[], opts?: { model?: string, baseUrl?: string }): Promise<number[][]> {
  const model = opts?.model || 'snowflake-arctic-embed2';
  const baseUrl = opts?.baseUrl || 'http://localhost:11434';

  const results: number[][] = [];
  const chunkSize = 10;
  
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const embs = await embedBatch(chunk, model, baseUrl);
    
    if (!embs || embs.length === 0) {
      console.error(`Zero embeddings returned for chunk. Stopping process.`);
      throw new Error("Zero embeddings returned");
    }

    console.log(`Received ${embs.length} embeddings, dimension of first: ${embs[0]?.length || 0}`);
    
    for (const emb of embs) {
      results.push(emb || []);
    }
  }
  return results;
}

export async function embedRecords(db: Database, did: string, opts?: { batchSize?: number, model?: string, baseUrl?: string }): Promise<number> {
  const batchSize = opts?.batchSize || 50;
  
  const records = getPostsWithoutEmbeddings(db, did);
  if (records.length === 0) {
    console.log(`No records to embed for ${did}`);
    return 0;
  }
  
  let embeddedCount = 0;
  const totalRecords = records.length;
  console.log(`Found ${totalRecords} records to check for embedding for ${did}`);
  
  // Filter out records without text
  const validRecords: { id: number, text: string }[] = [];
  for (const record of records) {
    try {
      const parsed = JSON.parse(record.raw_json);
      if (parsed && typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
        validRecords.push({ id: record.id, text: parsed.text.trim() });
      }
    } catch (err) {
      // Ignore invalid JSON
    }
  }
  
  const totalValid = validRecords.length;
  if (totalValid === 0) {
    console.log(`No valid text records found to embed for ${did}`);
    return 0;
  }
  console.log(`Found ${totalValid} records with valid text to embed`);
  
  for (let i = 0; i < totalValid; i += batchSize) {
    const batch = validRecords.slice(i, i + batchSize);
    const texts = batch.map(r => r.text);
    
    const embeddings = await embedTexts(texts, opts);
    
    let validCount = 0;
    for (const emb of embeddings) {
      if (emb && emb.length > 0) validCount++;
    }
    console.log(`Received ${validCount}/${embeddings.length} valid embeddings`);
    
    if (embeddings.length !== texts.length) {
      console.error(`Mismatch between requested texts (${texts.length}) and received embeddings (${embeddings.length})`);
      continue;
    }
    
    let storedInBatch = 0;
    const tx = db.transaction((batchRecords: typeof batch, batchEmbeddings: number[][]) => {
      for (let j = 0; j < batchRecords.length; j++) {
        const id = batchRecords[j].id;
        const emb = batchEmbeddings[j];
        if (!emb || emb.length === 0) continue; // skip failed embeddings
        const float32Array = new Float32Array(emb);
        const buffer = Buffer.from(float32Array.buffer);
        updateEmbedding(db, id, buffer);
        storedInBatch++;
      }
    });
    
    tx(batch, embeddings);
    
    const countRow = db.query(`SELECT COUNT(*) as count FROM records WHERE repo_did = ? AND embedding IS NOT NULL`).get(did) as { count: number };
    const totalStored = countRow.count;
    console.log(`Verified total stored embeddings for ${did}: ${totalStored}`);
    
    if (storedInBatch === 0) {
      console.error(`No embeddings were stored after this batch. Stopping process.`);
      throw new Error("Storage validation failed: 0 embeddings stored in batch");
    }
    
    embeddedCount += batch.length;
    console.log(`Embedded batch ${Math.ceil((i + batchSize) / batchSize)}/${Math.ceil(totalValid / batchSize)} (${embeddedCount}/${totalValid} records)`);
  }
  
  return embeddedCount;
}
