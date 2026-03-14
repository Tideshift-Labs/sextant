import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

function envFloat(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseFloat(v) : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (!v) return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}

export const config = {
  docsPath: path.resolve(envStr('DOCS_PATH', './docs')),
  ollamaUrl: envStr('OLLAMA_URL', 'http://localhost:11434'),
  embeddingModel: envStr('EMBEDDING_MODEL', 'nomic-embed-text'),
  embeddingDims: envInt('EMBEDDING_DIMS', 768),
  dataPath: path.resolve(envStr('DATA_PATH', '.sextant')),
  watchEnabled: envBool('WATCH_ENABLED', true),
  maxChunkTokens: envInt('MAX_CHUNK_TOKENS', 512),
  chunkOverlapLines: envInt('CHUNK_OVERLAP_LINES', 2),
  defaultTopK: envInt('DEFAULT_TOP_K', 10),
  hybridWeightText: envFloat('HYBRID_WEIGHT_TEXT', 0.5),
  hybridWeightVector: envFloat('HYBRID_WEIGHT_VECTOR', 0.5),

  // Embedding instructions (nomic-embed-text uses "search_document: " / "search_query: " prefixes)
  indexInstruction: envStr('INDEX_INSTRUCTION', 'search_document: '),
  queryInstruction: envStr('QUERY_INSTRUCTION', 'search_query: '),

  // Persistence debounce
  persistDebounceMs: envInt('PERSIST_DEBOUNCE_MS', 5000),

  // Embedding batch size
  embeddingBatchSize: envInt('EMBEDDING_BATCH_SIZE', 32),
} as const;

export type Config = typeof config;
