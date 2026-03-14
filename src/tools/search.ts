import { config } from '../config.ts';
import { embedQuery, checkOllamaHealth } from '../indexer/embedder.ts';
import { searchHybrid, searchKeyword, searchVector } from '../store/orama-store.ts';

interface SearchArgs {
  query: string;
  top_k?: number;
  category?: string;
  search_mode?: 'hybrid' | 'semantic' | 'keyword';
}

export async function handleSearch(args: SearchArgs): Promise<string> {
  const { query, category, search_mode = 'hybrid' } = args;
  const topK = Math.min(args.top_k ?? config.defaultTopK, 30);

  try {
    let results;

    if (search_mode === 'keyword') {
      results = await searchKeyword(query, topK, category);
    } else {
      // Hybrid or semantic both need embeddings
      const ollamaOk = await checkOllamaHealth();
      if (!ollamaOk) {
        if (search_mode === 'semantic') {
          return 'Error: Embedding service unavailable — start Ollama with `ollama serve` and pull `qwen3-embedding:0.6b`. Semantic search requires embeddings.';
        }
        // Fall back to keyword for hybrid
        console.error('[search] Ollama unavailable, falling back to keyword search');
        results = await searchKeyword(query, topK, category);
      } else {
        const queryEmbedding = await embedQuery(query);

        if (search_mode === 'semantic') {
          results = await searchVector(queryEmbedding, topK, category);
        } else {
          results = await searchHybrid(query, queryEmbedding, topK, category);
        }
      }
    }

    if (results.hits.length === 0) {
      return `No results found for "${query}"${category ? ` in category "${category}"` : ''}.`;
    }

    const lines: string[] = [
      `Found ${results.hits.length} results for "${query}" (mode: ${search_mode}):`,
      '',
    ];

    for (let i = 0; i < results.hits.length; i++) {
      const hit = results.hits[i]!;
      const doc = hit.document as any;
      lines.push(`--- Result ${i + 1} (score: ${hit.score.toFixed(4)}) ---`);
      lines.push(`File: ${doc.filePath}`);
      lines.push(`Section: ${doc.headingSlug}`);
      lines.push(`Category: ${doc.category}`);
      lines.push('');
      lines.push(doc.content);
      lines.push('');
    }

    return lines.join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Search error: ${msg}`;
  }
}
