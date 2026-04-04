import { Database } from 'bun:sqlite';
import { updateEmbedding, getPostsWithoutEmbeddings } from './db/queries.js';

export async function embedTexts(texts: string[], opts?: { model?: string, baseUrl?: string }): Promise<number[][]> {
  const model = opts?.model || 'snowflake-arctic-embed2';
  const baseUrl = opts?.baseUrl || 'http://localhost:11434';
  
  try {
    const res = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts })
    });
    
    if (!res.ok) {
      console.error(`Ollama API error: ${res.status} ${res.statusText}`);
      return [];
    }
    
    const data = await res.json() as any;
    return data.embeddings || [];
  } catch (err) {
    console.error(`Failed to embed texts:`, err);
    return [];
  }
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
    if (embeddings.length !== texts.length) {
      console.error(`Mismatch between requested texts (${texts.length}) and received embeddings (${embeddings.length})`);
      continue;
    }
    
    const tx = db.transaction((batchRecords: typeof batch, batchEmbeddings: number[][]) => {
      for (let j = 0; j < batchRecords.length; j++) {
        const id = batchRecords[j].id;
        const emb = batchEmbeddings[j];
        const float32Array = new Float32Array(emb);
        const buffer = Buffer.from(float32Array.buffer);
        updateEmbedding(db, id, buffer);
      }
    });
    
    tx(batch, embeddings);
    
    embeddedCount += batch.length;
    console.log(`Embedded batch ${Math.ceil((i + batchSize) / batchSize)}/${Math.ceil(totalValid / batchSize)} (${embeddedCount}/${totalValid} records)`);
  }
  
  return embeddedCount;
}
