export interface DocChunk {
  id: string;
  filePath: string;
  fileName: string;
  category: string;
  headingHierarchy: string[];
  headingSlug: string;
  chunkIndex: number;
  content: string;
  charCount: number;
  lastModified: number;
}

export interface ChunkMetadata {
  title?: string;
  tags?: string[];
  category?: string;
}

export interface IndexStats {
  filesProcessed: number;
  chunksCreated: number;
  duration: number;
}

export interface IndexedFile {
  filePath: string;
  lastModified: number;
  chunkCount: number;
  title: string | null;
  category: string | null;
  indexedAt: number;
}
