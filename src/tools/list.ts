import { listFiles } from '../store/metadata-db.ts';
import { getState } from '../indexer/state.ts';

interface ListArgs {
  category?: string;
}

export function handleList(args: ListArgs): string {
  const files = listFiles(args.category);

  if (files.length === 0) {
    const indexState = getState();
    if (indexState.status === 'indexing') {
      return `Sextant is still performing initial indexing (${indexState.filesProcessed}/${indexState.filesFound} files). Document list will be available shortly. Use sextant_status to check progress.`;
    }
    return args.category
      ? `No documents found in category "${args.category}".`
      : 'No documents indexed yet.';
  }

  const lines: string[] = [
    `Indexed documents${args.category ? ` (category: ${args.category})` : ''}: ${files.length} files`,
    '',
  ];

  for (const f of files) {
    lines.push(`- ${f.filePath} [${f.category}] (${f.chunkCount} chunks)${f.title ? ` — ${f.title}` : ''}`);
  }

  return lines.join('\n');
}
