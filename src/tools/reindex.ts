import { config } from '../config.ts';
import { fullReindex } from '../indexer/pipeline.ts';
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

  const clearExisting = args.clear_existing !== false; // default true

  try {
    console.error(`[reindex] Starting full reindex (clear_existing: ${clearExisting})...`);
    const stats = await fullReindex(config.docsPath, clearExisting);
    return [
      'Reindex complete:',
      `  Files processed: ${stats.filesProcessed}`,
      `  Chunks created: ${stats.chunksCreated}`,
      `  Duration: ${stats.duration}ms`,
    ].join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Reindex error: ${msg}`;
  }
}
