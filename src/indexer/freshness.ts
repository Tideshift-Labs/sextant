import path from 'path';
import { Glob } from 'bun';
import { config } from '../config.ts';
import { getFile, getAllFiles } from '../store/metadata-db.ts';
import { getState } from './state.ts';
import { indexAll } from './pipeline.ts';
import { reloadIfChanged } from '../store/persistence.ts';

export interface FreshnessResult {
  stale: boolean;
  staleCount?: number;
  alreadyIndexing?: boolean;
}

export async function checkAndReindex(): Promise<FreshnessResult> {
  // Pick up any index persisted by another process first
  await reloadIfChanged();

  const docsPath = config.docsPath;

  // Scan disk for current markdown files
  const glob = new Glob('**/*.md');
  const diskFiles = new Set<string>();
  for await (const match of glob.scan({ cwd: docsPath, absolute: false })) {
    diskFiles.add(match);
  }

  // Check for deleted files
  const indexedFiles = getAllFiles();
  const indexedSet = new Set(indexedFiles.map((f) => f.filePath));
  let staleCount = 0;

  for (const indexed of indexedFiles) {
    if (!diskFiles.has(indexed.filePath)) {
      staleCount++;
    }
  }

  // Check for new or modified files
  for (const relPath of diskFiles) {
    const absPath = path.join(docsPath, relPath);
    try {
      const stat = await Bun.file(absPath).stat();
      if (!stat) continue;

      const existing = getFile(relPath);
      if (!existing) {
        // New file
        staleCount++;
      } else if (stat.mtimeMs > existing.lastModified) {
        // Modified file
        staleCount++;
      }
    } catch {
      // File disappeared between scan and stat, count as stale
      if (indexedSet.has(relPath)) staleCount++;
    }
  }

  if (staleCount === 0) {
    return { stale: false };
  }

  if (getState().status === 'indexing') {
    return { stale: true, staleCount, alreadyIndexing: true };
  }

  // Fire-and-forget background reindex
  indexAll(docsPath).catch((err) => {
    console.error('[freshness] Background reindex failed:', err);
  });

  return { stale: true, staleCount };
}
