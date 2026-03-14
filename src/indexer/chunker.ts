import path from 'path';
import { createHash } from 'crypto';
import { config } from '../config.ts';
import type { DocChunk, ChunkMetadata } from './types.ts';

const MAX_CHUNK_CHARS = config.maxChunkTokens * 4; // ~1 token ≈ 4 chars

interface FrontmatterResult {
  metadata: ChunkMetadata;
  bodyStartIndex: number;
}

function parseFrontmatter(lines: string[]): FrontmatterResult {
  const metadata: ChunkMetadata = {};
  if (lines[0]?.trim() !== '---') {
    return { metadata, bodyStartIndex: 0 };
  }

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') {
      // Parse YAML-like frontmatter between the --- delimiters
      for (let j = 1; j < i; j++) {
        const line = lines[j]!;
        const match = line.match(/^(\w+)\s*:\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          if (key === 'title') metadata.title = value!.replace(/^["']|["']$/g, '');
          if (key === 'category') metadata.category = value!.replace(/^["']|["']$/g, '');
          if (key === 'tags') {
            metadata.tags = value!
              .replace(/^\[|\]$/g, '')
              .split(',')
              .map((t) => t.trim().replace(/^["']|["']$/g, ''));
          }
        }
      }
      return { metadata, bodyStartIndex: i + 1 };
    }
  }
  return { metadata, bodyStartIndex: 0 };
}

function makeChunkId(filePath: string, headingHierarchy: string[], chunkIndex: number): string {
  const input = `${filePath}::${headingHierarchy.join('::')}::${chunkIndex}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function getHeadingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1]!.length : 0;
}

function getHeadingText(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim();
}

function isInsideCodeBlock(lines: string[], index: number): boolean {
  let fenceCount = 0;
  for (let i = 0; i < index; i++) {
    if (lines[i]!.trimStart().startsWith('```')) {
      fenceCount++;
    }
  }
  return fenceCount % 2 === 1;
}

interface HeadingSection {
  headingHierarchy: string[];
  lines: string[];
}

function splitByHeadings(lines: string[]): HeadingSection[] {
  const sections: HeadingSection[] = [];
  const hierarchyStack: { level: number; text: string }[] = [];
  let currentLines: string[] = [];
  let hasHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const level = getHeadingLevel(line);

    if (level > 0 && !isInsideCodeBlock(lines, i)) {
      // Save previous section
      if (currentLines.length > 0 || hasHeading) {
        sections.push({
          headingHierarchy: hierarchyStack.map((h) => h.text),
          lines: currentLines,
        });
      }

      // Update heading hierarchy
      while (hierarchyStack.length > 0 && hierarchyStack[hierarchyStack.length - 1]!.level >= level) {
        hierarchyStack.pop();
      }
      hierarchyStack.push({ level, text: getHeadingText(line) });

      currentLines = [line];
      hasHeading = true;
    } else {
      currentLines.push(line);
    }
  }

  // Push final section
  if (currentLines.length > 0) {
    sections.push({
      headingHierarchy: hasHeading ? hierarchyStack.map((h) => h.text) : [],
      lines: currentLines,
    });
  }

  return sections;
}

function splitLargeChunk(content: string, overlapLines: number): string[] {
  if (content.length <= MAX_CHUNK_CHARS) return [content];

  const paragraphs = content.split(/\n\n+/);
  const subChunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
      subChunks.push(current.trim());
      // Add overlap: last N lines of previous chunk
      const prevLines = current.trimEnd().split('\n');
      const overlap = prevLines.slice(-overlapLines).join('\n');
      current = overlap ? overlap + '\n\n' + para : para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }

  if (current.trim()) {
    subChunks.push(current.trim());
  }

  return subChunks.length > 0 ? subChunks : [content];
}

export function chunkMarkdown(
  filePath: string,
  rawContent: string,
  lastModified: number,
  docsPath: string
): { chunks: DocChunk[]; metadata: ChunkMetadata } {
  const relativePath = path.relative(docsPath, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);
  const parts = relativePath.split('/');
  const category = parts.length > 1 ? parts[0]! : 'root';

  const lines = rawContent.split('\n');
  const { metadata, bodyStartIndex } = parseFrontmatter(lines);
  const bodyLines = lines.slice(bodyStartIndex);
  const fileCategory = metadata.category ?? category;

  const sections = splitByHeadings(bodyLines);
  const chunks: DocChunk[] = [];

  // If no headings found, treat entire file as one chunk
  if (sections.length === 0 || (sections.length === 1 && sections[0]!.headingHierarchy.length === 0)) {
    const content = bodyLines.join('\n').trim();
    if (content) {
      const hierarchy = [metadata.title ?? fileName.replace(/\.md$/, '')];
      const subChunks = splitLargeChunk(content, config.chunkOverlapLines);
      for (let i = 0; i < subChunks.length; i++) {
        chunks.push({
          id: makeChunkId(relativePath, hierarchy, i),
          filePath: relativePath,
          fileName,
          category: fileCategory,
          headingHierarchy: hierarchy,
          headingSlug: hierarchy.join(' > '),
          chunkIndex: i,
          content: subChunks[i]!,
          charCount: subChunks[i]!.length,
          lastModified,
        });
      }
    }
    return { chunks, metadata };
  }

  for (const section of sections) {
    const content = section.lines.join('\n').trim();
    if (!content) continue;

    const hierarchy = section.headingHierarchy.length > 0
      ? section.headingHierarchy
      : [metadata.title ?? fileName.replace(/\.md$/, '')];

    const subChunks = splitLargeChunk(content, config.chunkOverlapLines);
    for (let i = 0; i < subChunks.length; i++) {
      chunks.push({
        id: makeChunkId(relativePath, hierarchy, i),
        filePath: relativePath,
        fileName,
        category: fileCategory,
        headingHierarchy: hierarchy,
        headingSlug: hierarchy.join(' > '),
        chunkIndex: i,
        content: subChunks[i]!,
        charCount: subChunks[i]!.length,
        lastModified,
      });
    }
  }

  return { chunks, metadata };
}
