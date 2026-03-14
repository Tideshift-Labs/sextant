import { config } from '../config.ts';
import { getState } from '../indexer/state.ts';
import { checkOllamaHealth } from '../indexer/embedder.ts';
import { listFiles } from '../store/metadata-db.ts';

export async function handleStatus(): Promise<string> {
  const state = getState();
  const ollamaOk = await checkOllamaHealth();
  const files = listFiles();

  const lines: string[] = ['Sextant Status'];

  // Indexing status
  if (state.status === 'indexing') {
    lines.push(`  Indexing:  in progress (${state.filesProcessed}/${state.filesFound} files${state.currentFile ? `, current: ${state.currentFile}` : ''})`);
  } else if (state.status === 'ready') {
    const duration = state.startedAt && state.completedAt
      ? ((state.completedAt - state.startedAt) / 1000).toFixed(1)
      : '?';
    lines.push(`  Indexing:  ready (${state.filesProcessed} files, ${state.chunksCreated} chunks, took ${duration}s)`);
  } else if (state.status === 'error') {
    lines.push(`  Indexing:  error: ${state.lastError}`);
  } else {
    lines.push(`  Indexing:  idle`);
  }

  // Ollama health
  if (ollamaOk) {
    lines.push(`  Ollama:    healthy (${config.embeddingModel} at ${config.ollamaUrl})`);
  } else {
    lines.push(`  Ollama:    unreachable at ${config.ollamaUrl}`);
  }

  // Index stats grouped by category
  if (files.length > 0) {
    const byCategory = new Map<string, number>();
    for (const f of files) {
      const cat = f.category ?? 'root';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    }
    lines.push(`  Index:     ${files.length} files across ${byCategory.size} categories`);
    for (const [cat, count] of [...byCategory.entries()].sort()) {
      lines.push(`               ${cat}: ${count} files`);
    }
  } else {
    lines.push(`  Index:     empty`);
  }

  // Config
  lines.push(`  Docs path: ${config.docsPath}`);

  return lines.join('\n');
}
