import { config } from '../config.ts';
import { fullReindex } from '../indexer/pipeline.ts';
import { getState } from '../indexer/state.ts';
import { reloadIfChanged } from '../store/persistence.ts';

interface ReindexArgs {
  clear_existing?: boolean;
}

// Set by server.ts based on lock status
let primaryInstance = true;

export function setReindexPrimary(value: boolean): void {
  primaryInstance = value;
}

export async function handleReindex(args: ReindexArgs): Promise<string> {
  if (!primaryInstance) {
    // Secondary instances should not index. Reload from disk instead.
    const reloaded = await reloadIfChanged();
    if (reloaded) {
      return 'This is a secondary instance. Reloaded the latest index from disk (written by the primary instance).';
    }
    return 'This is a secondary instance. The index is already up to date. To force a full reindex, use the primary Claude Code session (the first one opened).';
  }

  const indexState = getState();
  if (indexState.status === 'indexing') {
    return `Indexing is already in progress (${indexState.filesProcessed}/${indexState.filesFound} files). Use sextant_status to monitor progress.`;
  }

  const clearExisting = args.clear_existing !== false; // default true

  console.error(`[reindex] Starting full reindex (clear_existing: ${clearExisting})...`);

  // Fire and forget -- return immediately
  fullReindex(config.docsPath, clearExisting)
    .then((stats) => {
      console.error(`[reindex] Complete: ${stats.filesProcessed} files, ${stats.chunksCreated} chunks in ${stats.duration}ms`);
    })
    .catch((err) => {
      console.error('[reindex] Failed:', err);
    });

  return `Reindex started. Use sextant_status to monitor progress.`;
}
