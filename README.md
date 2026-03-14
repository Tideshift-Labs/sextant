# Sextant

Sextant is an MCP server that provides hybrid semantic and keyword search over a local folder of markdown files. It indexes your docs, chunks them by heading, embeds them through a local Ollama model, and exposes search and retrieval tools over the Model Context Protocol (MCP).

Claude Code (or any MCP client) can then search your documentation using natural language queries, exact keyword lookups, or a combination of both.

## How it works

1. Sextant scans a folder of markdown files and splits them into chunks at each heading boundary.
2. Each chunk is embedded locally using Ollama (qwen3-embedding).
3. Chunks and their embeddings are stored in Orama, which handles full-text, vector, and hybrid search in a single library.
4. File metadata is tracked in SQLite (via bun:sqlite) so unchanged files are skipped on restart.
5. A file watcher picks up changes automatically and re-indexes only the affected files.
6. The MCP server exposes four tools over stdio: `search_docs`, `list_docs`, `get_doc`, and `reindex_docs`.

The entire stack runs locally with no external services. There are no native modules; everything is pure JavaScript/TypeScript.

## Prerequisites

### Bun

Sextant runs on [Bun](https://bun.sh), which is used as the runtime, package manager, and bundler.

**Windows (PowerShell):**

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

**macOS / Linux:**

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify the installation with `bun --version`.

### Ollama

[Ollama](https://ollama.com) must be installed and running locally. Pull the embedding model before first use:

```bash
ollama pull qwen3-embedding:0.6b
```

Ollama runs on `http://localhost:11434` by default. If Ollama is not running, keyword search will still work, but semantic and hybrid search will be unavailable.

## Usage with Claude Code

Add the following to your Claude Code MCP configuration (`.claude/mcp.json` in your project):

```json
{
  "mcpServers": {
    "sextant": {
      "type": "stdio",
      "command": "bunx",
      "args": ["github:Tideshift-Labs/sextant"],
      "env": {
        "DOCS_PATH": "/absolute/path/to/your/docs"
      }
    }
  }
}
```

Set `DOCS_PATH` to the absolute path of the markdown folder you want to index.

Once configured, Claude Code will have access to the following tools:

- **search_docs** - Search documentation using hybrid semantic + keyword search. Supports three modes: `hybrid` (default, combines both), `semantic` (vector similarity only), and `keyword` (exact text matching only). Accepts an optional category filter.
- **list_docs** - List all indexed documents with their categories, titles, and chunk counts.
- **get_doc** - Retrieve the full content of a specific document by file path.
- **reindex_docs** - Force a full re-index of all documents.

## Local development

Clone the repo and install dependencies:

```bash
git clone https://github.com/Tideshift-Labs/sextant.git
cd sextant
bun install
```

Create a `.env` file (or copy `.env.example`):

```bash
cp .env.example .env
```

Place some markdown files in the `docs/` folder, then start the server:

```bash
bun dev
```

The server logs to stderr. On first run it will index all markdown files and persist the index to `data/`. On subsequent starts it loads the persisted index and only re-indexes files that have changed.

## Configuration

All settings can be configured through environment variables or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `DOCS_PATH` | `./docs` | Path to the markdown folder to index |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `EMBEDDING_MODEL` | `qwen3-embedding:0.6b` | Ollama embedding model name |
| `EMBEDDING_DIMS` | `1024` | Embedding vector dimensions |
| `DATA_PATH` | `./data` | Where to store the index and metadata |
| `WATCH_ENABLED` | `true` | Watch for file changes and auto-reindex |
| `MAX_CHUNK_TOKENS` | `512` | Maximum chunk size (estimated as chars / 4) |
| `DEFAULT_TOP_K` | `10` | Default number of search results |
| `HYBRID_WEIGHT_TEXT` | `0.3` | Weight for keyword matching in hybrid mode |
| `HYBRID_WEIGHT_VECTOR` | `0.7` | Weight for semantic matching in hybrid mode |

## Building a standalone executable

Bun can compile the server into a single executable that includes the runtime:

```bash
bun run build
```

This produces `dist/docs-mcp-server` (or `.exe` on Windows). The executable can be distributed and run without Bun installed on the target machine.

## Project structure

```
src/
  index.ts              Entry point, wires everything together
  server.ts             MCP server definition and tool registration
  config.ts             Environment variable loading and defaults
  indexer/
    chunker.ts          Splits markdown by headings into chunks
    embedder.ts         Calls Ollama for batch embedding
    pipeline.ts         Orchestrates scan, chunk, embed, store
    watcher.ts          File watcher for automatic re-indexing
    types.ts            Shared TypeScript types
  store/
    orama-store.ts      Orama instance: create, insert, search
    metadata-db.ts      SQLite for file-level metadata tracking
    persistence.ts      Save/load Orama index to/from disk
  tools/
    search.ts           search_docs tool handler
    list.ts             list_docs tool handler
    get.ts              get_doc tool handler
    reindex.ts          reindex_docs tool handler
```

## License

MIT
