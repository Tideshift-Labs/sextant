import path from 'path';
import { config } from '../config.ts';

interface GetArgs {
  path: string;
}

export async function handleGet(args: GetArgs): Promise<string> {
  const filePath = path.join(config.docsPath, args.path);

  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return `Error: File not found: ${args.path}`;
    }
    const content = await file.text();
    return `# ${args.path}\n\n${content}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error reading file: ${msg}`;
  }
}
