import { create, insert, insertMultiple, remove, search, save, load } from '@orama/orama';
import type { Orama, Results, SearchParams } from '@orama/orama';
import { config } from '../config.ts';
import type { DocChunk } from '../indexer/types.ts';

const SCHEMA = {
  id: 'string' as const,
  filePath: 'string' as const,
  fileName: 'string' as const,
  category: 'string' as const,
  headingSlug: 'string' as const,
  content: 'string' as const,
  chunkIndex: 'number' as const,
  lastModified: 'number' as const,
  embedding: `vector[${config.embeddingDims}]` as const,
};

export type OramaDB = Orama<typeof SCHEMA>;

let db: OramaDB | null = null;

export function getSchema() {
  return SCHEMA;
}

export async function initStore(): Promise<OramaDB> {
  db = await create({ schema: SCHEMA }) as OramaDB;
  return db;
}

export function getStore(): OramaDB {
  if (!db) throw new Error('Orama store not initialized. Call initStore() first.');
  return db;
}

export function setStore(newDb: OramaDB): void {
  db = newDb;
}

export async function insertChunks(chunks: DocChunk[], embeddings: number[][]): Promise<void> {
  const store = getStore();
  const docs = chunks.map((chunk, i) => ({
    id: chunk.id,
    filePath: chunk.filePath,
    fileName: chunk.fileName,
    category: chunk.category,
    headingSlug: chunk.headingSlug,
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    lastModified: chunk.lastModified,
    embedding: embeddings[i]!,
  }));

  await insertMultiple(store, docs);
}

export async function removeByIds(ids: string[]): Promise<number> {
  const store = getStore();
  let removed = 0;
  for (const id of ids) {
    try {
      await remove(store, id);
      removed++;
    } catch {
      // ID not found in store, skip
    }
  }
  return removed;
}

export async function removeByFile(filePath: string): Promise<number> {
  const store = getStore();
  // Fallback: search for chunks by filePath (used when chunkIds are not available)
  const results = await search(store, {
    mode: 'fulltext',
    term: filePath,
    properties: ['filePath'],
    limit: 10000,
  } as any);

  let removed = 0;
  for (const hit of results.hits) {
    if ((hit.document as any).filePath === filePath) {
      await remove(store, hit.id);
      removed++;
    }
  }
  return removed;
}

export async function searchHybrid(
  query: string,
  queryEmbedding: number[],
  topK: number,
  category?: string
): Promise<Results<any>> {
  const store = getStore();
  const params: any = {
    mode: 'hybrid',
    term: query,
    vector: {
      value: queryEmbedding,
      property: 'embedding',
    },
    similarity: config.similarityThreshold,
    limit: topK,
    hybridWeights: {
      text: config.hybridWeightText,
      vector: config.hybridWeightVector,
    },
  };

  if (category) {
    params.where = { category: { eq: category } };
  }

  return search(store, params);
}

export async function searchKeyword(query: string, topK: number, category?: string): Promise<Results<any>> {
  const store = getStore();
  const params: any = {
    mode: 'fulltext',
    term: query,
    limit: topK,
  };

  if (category) {
    params.where = { category: { eq: category } };
  }

  return search(store, params);
}

export async function searchVector(queryEmbedding: number[], topK: number, category?: string): Promise<Results<any>> {
  const store = getStore();
  const params: any = {
    mode: 'vector',
    vector: {
      value: queryEmbedding,
      property: 'embedding',
    },
    similarity: config.similarityThreshold,
    limit: topK,
  };

  if (category) {
    params.where = { category: { eq: category } };
  }

  return search(store, params);
}

export async function getDocumentCount(): Promise<number> {
  const store = getStore();
  const results = await search(store, {
    mode: 'fulltext',
    term: '',
    limit: 0,
  } as any);
  return results.count;
}

export async function saveIndex(): Promise<any> {
  return save(getStore());
}

export async function loadIndex(data: any): Promise<void> {
  const store = await create({ schema: SCHEMA }) as OramaDB;
  await load(store, data);
  db = store;
}
