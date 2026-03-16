import path from 'path';
import { Glob } from 'bun';
import { config } from '../config.ts';
import { chunkMarkdown } from './chunker.ts';
import { embedTexts, checkOllamaHealth } from './embedder.ts';
import { insertChunks, removeByFile, initStore } from '../store/orama-store.ts';
import { upsertFile, removeFile as removeFileMeta, getFile, getAllFiles, clearAll as clearMetadata } from '../store/metadata-db.ts';
import { persistToDisk } from '../store/persistence.ts';
import { setIndexing, updateProgress, setReady, setError, isCancelRequested, getState } from './state.ts';
import type { IndexStats, DocChunk } from './types.ts';

export async function indexAll(docsPath: string): Promise<IndexStats> {
  const start = Date.now();
  let filesProcessed = 0;
  let chunksCreated = 0;

  // Collect all markdown files
  const glob = new Glob('**/*.md');
  const filePaths: string[] = [];
  for await (const match of glob.scan({ cwd: docsPath, absolute: false })) {
    filePaths.push(match);
  }

  // Remove files from the index that no longer exist on disk
  const diskFileSet = new Set(filePaths);
  const indexedFiles = getAllFiles();
  let deletionsPerformed = false;
  for (const indexed of indexedFiles) {
    if (!diskFileSet.has(indexed.filePath)) {
      console.error(`[pipeline] Removing deleted file from index: ${indexed.filePath}`);
      await removeByFile(indexed.filePath);
      removeFileMeta(indexed.filePath);
      deletionsPerformed = true;
    }
  }

  setIndexing(filePaths.length);

  if (filePaths.length === 0) {
    console.error('[pipeline] No markdown files found in', docsPath);
    setReady({ filesProcessed: 0, chunksCreated: 0 });
    return { filesProcessed: 0, chunksCreated: 0, duration: Date.now() - start };
  }

  console.error(`[pipeline] Found ${filePaths.length} markdown files`);

  // Check Ollama availability
  const ollamaOk = await checkOllamaHealth();
  if (!ollamaOk) {
    console.error(`[pipeline] WARNING: Ollama not reachable at ${config.ollamaUrl}. Indexing will fail for embeddings.`);
    console.error(`[pipeline] Run: ollama pull ${config.embeddingModel}`);
  }

  // Chunk all files
  const allChunks: DocChunk[] = [];
  const fileMetadata: { filePath: string; lastModified: number; chunkCount: number; title: string | null; category: string }[] = [];

  for (const relPath of filePaths) {
    if (isCancelRequested()) {
      console.error('[pipeline] Indexing cancelled');
      setError('Indexing cancelled');
      return { filesProcessed, chunksCreated, duration: Date.now() - start };
    }

    updateProgress(filesProcessed, chunksCreated, relPath);
    const absPath = path.join(docsPath, relPath);
    try {
      const file = Bun.file(absPath);
      const stat = await file.stat();
      if (!stat) continue;
      const lastModified = stat.mtimeMs;

      // Check if file needs re-indexing
      const existing = getFile(relPath);
      if (existing && existing.lastModified >= lastModified) {
        console.error(`[pipeline] Skipping unchanged: ${relPath}`);
        continue;
      }

      const content = await file.text();
      const { chunks, metadata } = chunkMarkdown(absPath, content, lastModified, docsPath);

      if (chunks.length > 0) {
        // Always remove old chunks before inserting to avoid duplicate ID collisions
        // (Orama and metadata DB can get out of sync if a previous persist was incomplete)
        await removeByFile(relPath);
        allChunks.push(...chunks);
        fileMetadata.push({
          filePath: relPath,
          lastModified,
          chunkCount: chunks.length,
          title: metadata.title ?? chunks[0]?.headingHierarchy[0] ?? null,
          category: chunks[0]?.category ?? 'root',
        });
      }

      filesProcessed++;
    } catch (err) {
      console.error(`[pipeline] Error processing ${relPath}:`, err);
    }
  }

  if (allChunks.length === 0) {
    console.error('[pipeline] No new chunks to index');
    if (deletionsPerformed) await persistToDisk();
    setReady({ filesProcessed, chunksCreated: 0 });
    return { filesProcessed, chunksCreated: 0, duration: Date.now() - start };
  }

  // Embed all chunks in batches
  console.error(`[pipeline] Embedding ${allChunks.length} chunks...`);
  try {
    const texts = allChunks.map((c) => c.content);
    const embeddings = await embedTexts(texts);

    // Insert into Orama
    await insertChunks(allChunks, embeddings);
    chunksCreated = allChunks.length;

    // Update metadata DB
    for (const fm of fileMetadata) {
      upsertFile(fm.filePath, fm.lastModified, fm.chunkCount, fm.title, fm.category);
    }

    // Persist
    await persistToDisk();

    console.error(`[pipeline] Indexed ${filesProcessed} files, ${chunksCreated} chunks in ${Date.now() - start}ms`);
    setReady({ filesProcessed, chunksCreated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setError(msg);
    console.error('[pipeline] Embedding/indexing failed:', err);
    throw err;
  }

  return { filesProcessed, chunksCreated, duration: Date.now() - start };
}

export async function fullReindex(docsPath: string, clearExisting: boolean): Promise<IndexStats> {
  if (getState().status === 'indexing') {
    return { filesProcessed: 0, chunksCreated: 0, duration: 0 };
  }

  if (clearExisting) {
    console.error('[pipeline] Clearing existing index...');
    await initStore();
    clearMetadata();
  }
  return indexAll(docsPath);
}
