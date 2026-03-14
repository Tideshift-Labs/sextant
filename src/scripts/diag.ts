import { config } from '../config.ts';
import { initMetadataDb } from '../store/metadata-db.ts';
import { initStore, getStore, insertChunks } from '../store/orama-store.ts';
import { search } from '@orama/orama';
import { embedTexts, embedQuery, checkOllamaHealth } from '../indexer/embedder.ts';
import { chunkMarkdown } from '../indexer/chunker.ts';
import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const TEST_DOC = `# Grip System

The grip system allows characters to pick up and hold objects realistically.
It uses inverse kinematics to adjust hand positions based on the object's shape.

## How It Works

When a character approaches an object, the system calculates grip points
based on the object's collision mesh. The IK solver then positions the
character's hands to match these grip points naturally.

## Configuration

You can configure grip strength, release threshold, and IK blend speed
in the grip component settings.
`;

async function diag() {
  console.log('=== Sextant Embedding Diagnostic ===\n');

  // Step 1: Check Ollama
  console.log('1. Checking Ollama health...');
  const healthy = await checkOllamaHealth();
  console.log(`   Ollama: ${healthy ? 'healthy' : 'UNREACHABLE'}`);
  console.log(`   Model: ${config.embeddingModel}`);
  console.log(`   Dims: ${config.embeddingDims}`);
  if (!healthy) {
    console.log('   STOPPING: Ollama must be running');
    return;
  }

  // Step 2: Test raw embedding
  console.log('\n2. Testing raw embedding call...');
  try {
    const embeddings = await embedTexts(['Hello world test']);
    console.log(`   Got ${embeddings.length} embedding(s)`);
    console.log(`   Dimensions: ${embeddings[0]?.length}`);
    console.log(`   First 5 values: [${embeddings[0]?.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
    const allZero = embeddings[0]?.every(v => v === 0);
    console.log(`   All zeros: ${allZero}`);
    if (embeddings[0]?.length !== config.embeddingDims) {
      console.log(`   WARNING: Model returns ${embeddings[0]?.length} dims but config expects ${config.embeddingDims}`);
    }
  } catch (err) {
    console.log(`   ERROR: ${err}`);
    return;
  }

  // Step 3: Create fresh store and index test doc
  console.log('\n3. Creating fresh store and indexing test doc...');
  mkdirSync(config.dataPath, { recursive: true });
  initMetadataDb();
  await initStore();

  const testDocPath = path.join(config.docsPath, '_diag_test.md');
  writeFileSync(testDocPath, TEST_DOC);

  const { chunks } = chunkMarkdown(testDocPath, TEST_DOC, Date.now(), config.docsPath);
  console.log(`   Chunks created: ${chunks.length}`);
  for (const c of chunks) {
    console.log(`   - "${c.headingSlug}" (${c.content.length} chars)`);
  }

  // Step 4: Embed chunks
  console.log('\n4. Embedding chunks...');
  const texts = chunks.map(c => c.content);
  const embeddings = await embedTexts(texts);
  console.log(`   Got ${embeddings.length} embeddings`);
  for (let i = 0; i < embeddings.length; i++) {
    const emb = embeddings[i]!;
    console.log(`   Chunk ${i}: ${emb.length} dims, first 3: [${emb.slice(0, 3).map(v => v.toFixed(6)).join(', ')}], allZero: ${emb.every(v => v === 0)}`);
  }

  // Step 5: Insert into store
  console.log('\n5. Inserting into Orama...');
  await insertChunks(chunks, embeddings);
  console.log('   Insert successful');

  // Step 6: Verify with keyword search
  console.log('\n6. Keyword search for "grip"...');
  const kwResults = await search(getStore(), { mode: 'fulltext', term: 'grip', limit: 3 } as any);
  console.log(`   Hits: ${kwResults.hits.length}`);
  for (const hit of kwResults.hits) {
    const doc = hit.document as any;
    console.log(`   - score=${hit.score.toFixed(4)}, section="${doc.headingSlug}"`);
    const emb = doc.embedding;
    if (Array.isArray(emb)) {
      console.log(`     stored embedding: ${emb.length} dims, first 3: [${emb.slice(0, 3).map((v: number) => v.toFixed(6)).join(', ')}]`);
    } else {
      console.log(`     stored embedding: ${typeof emb} (NOT an array!)`);
    }
  }

  // Step 7: Vector search
  console.log('\n7. Vector search for "grip system"...');
  try {
    const qEmb = await embedQuery('grip system');
    console.log(`   Query embedding: ${qEmb.length} dims`);

    const vecResults = await search(getStore(), {
      mode: 'vector',
      vector: { value: qEmb, property: 'embedding' },
      similarity: config.similarityThreshold,
      limit: 3,
    } as any);
    console.log(`   Hits: ${vecResults.hits.length}`);
    for (const hit of vecResults.hits) {
      const doc = hit.document as any;
      console.log(`   - score=${hit.score.toFixed(4)}, section="${doc.headingSlug}"`);
    }
  } catch (err) {
    console.log(`   ERROR: ${err}`);
  }

  // Step 8: Hybrid search
  console.log('\n8. Hybrid search for "picking up objects"...');
  try {
    const qEmb = await embedQuery('picking up objects');
    const hybridResults = await search(getStore(), {
      mode: 'hybrid',
      term: 'picking up objects',
      vector: { value: qEmb, property: 'embedding' },
      similarity: config.similarityThreshold,
      limit: 3,
      hybridWeights: { text: 0.5, vector: 0.5 },
    } as any);
    console.log(`   Hits: ${hybridResults.hits.length}`);
    for (const hit of hybridResults.hits) {
      const doc = hit.document as any;
      console.log(`   - score=${hit.score.toFixed(4)}, section="${doc.headingSlug}"`);
    }
  } catch (err) {
    console.log(`   ERROR: ${err}`);
  }

  // Cleanup
  try {
    const { unlinkSync } = require('fs');
    unlinkSync(testDocPath);
  } catch {}

  console.log('\n=== Done ===');
}

diag().catch(console.error);
