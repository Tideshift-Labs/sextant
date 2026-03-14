import { config } from '../config.ts';
import { fullReindex } from '../indexer/pipeline.ts';
import { getState } from '../indexer/state.ts';

interface ReindexArgs {
  clear_existing?: boolean;
}

export async function handleReindex(args: ReindexArgs): Promise<string> {
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
