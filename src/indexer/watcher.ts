import path from 'path';
import chokidar from 'chokidar';
import { indexFile, removeFileFromIndex } from './pipeline.ts';

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 1000;

function debounce(filePath: string, fn: () => void): void {
  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    filePath,
    setTimeout(() => {
      debounceTimers.delete(filePath);
      fn();
    }, DEBOUNCE_MS)
  );
}

export function startWatcher(docsPath: string): chokidar.FSWatcher {
  console.error(`[watcher] Watching ${docsPath} for changes...`);

  const watcher = chokidar.watch(path.join(docsPath, '**/*.md'), {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    console.error(`[watcher] File added: ${filePath}`);
    debounce(filePath, () => indexFile(filePath, docsPath));
  });

  watcher.on('change', (filePath) => {
    console.error(`[watcher] File changed: ${filePath}`);
    debounce(filePath, () => indexFile(filePath, docsPath));
  });

  watcher.on('unlink', (filePath) => {
    console.error(`[watcher] File removed: ${filePath}`);
    debounce(filePath, () => removeFileFromIndex(filePath, docsPath));
  });

  watcher.on('error', (error) => {
    console.error('[watcher] Error:', error);
  });

  return watcher;
}
