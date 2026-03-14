import { listFiles } from '../store/metadata-db.ts';

interface ListArgs {
  category?: string;
}

export function handleList(args: ListArgs): string {
  const files = listFiles(args.category);

  if (files.length === 0) {
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
