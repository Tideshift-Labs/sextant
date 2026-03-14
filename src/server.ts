import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { handleSearch } from './tools/search.ts';
import { handleList } from './tools/list.ts';
import { handleGet } from './tools/get.ts';
import { handleReindex } from './tools/reindex.ts';
import { handleStatus } from './tools/status.ts';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'sextant', version: '0.1.0' },
    {
      instructions: 'Sextant provides hybrid semantic and keyword search over project documentation. Use its tools to find information about architecture, decisions, guides, issues, worklogs, plans, and any project knowledge stored in markdown files.',
    },
  );

  // search_docs tool
  server.tool(
    'search_docs',
    'Search project documentation using hybrid semantic + keyword search. Returns the most relevant chunks from the docs folder. Use this to find information about architecture, decisions, guides, issues, worklogs, plans, and any project knowledge.',
    {
      query: z.string().describe(
        "Natural language search query OR exact keyword/identifier (e.g., 'how does replication work' or 'ISM-247')"
      ),
      top_k: z.number().optional().describe('Number of results to return (default: 10, max: 30)'),
      category: z.string().optional().describe(
        "Optional: filter by doc category/folder (e.g., 'architecture', 'worklogs', 'issues')"
      ),
      search_mode: z
        .enum(['hybrid', 'semantic', 'keyword'])
        .optional()
        .describe(
          "Search mode: 'hybrid' (default, best recall), 'semantic' (conceptual similarity only), 'keyword' (exact/token match only)"
        ),
    },
    async (args) => {
      const result = await handleSearch(args);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // list_docs tool
  server.tool(
    'list_docs',
    'List all indexed documents, optionally filtered by category. Returns file paths, categories, and document titles.',
    {
      category: z.string().optional().describe('Optional: filter by category/folder name'),
    },
    async (args) => {
      const result = handleList(args);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // get_doc tool
  server.tool(
    'get_doc',
    'Retrieve the full content of a specific document by its file path. Use after search_docs to read a complete document.',
    {
      path: z.string().describe(
        "Relative file path within the docs folder (e.g., 'architecture/networking.md')"
      ),
    },
    async (args) => {
      const result = await handleGet(args);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // reindex_docs tool
  server.tool(
    'reindex_docs',
    'Force a full re-index of all documents. Use if search results seem stale or docs have been updated.',
    {
      clear_existing: z
        .boolean()
        .optional()
        .describe('If true, wipe all existing index data before re-indexing (default: true)'),
    },
    async (args) => {
      const result = await handleReindex(args);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // sextant_status tool
  server.tool(
    'sextant_status',
    'Check Sextant health: indexing progress, Ollama connectivity, and index stats.',
    {},
    async () => {
      const result = await handleStatus();
      return { content: [{ type: 'text', text: result }] };
    }
  );

  return server;
}
