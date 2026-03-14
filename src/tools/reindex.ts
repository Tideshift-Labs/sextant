import { config } from '../config.ts';
import { fullReindex } from '../indexer/pipeline.ts';

interface ReindexArgs {
  clear_existing?: boolean;
}

export async function handleReindex(args: ReindexArgs): Promise<string> {
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
