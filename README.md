<p align="center">
  <img src="docs/sextant-logo.png" alt="Sextant" width="300">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/protocol-MCP-7c3aed" alt="MCP">
</p>

# Sextant

Sextant is an MCP server that provides hybrid semantic and keyword search over a local folder of markdown files. It indexes your docs, chunks them by heading, embeds them through a local Ollama model, and exposes search and retrieval tools over the Model Context Protocol (MCP).

Claude Code (or any MCP client) can then search your documentation using natural language queries, exact keyword lookups, or a combination of both.

## How it works

1. Sextant scans a folder of markdown files and splits them into chunks at each heading boundary.
2. Each chunk is embedded locally using Ollama (nomic-embed-text).
3. Chunks and their embeddings are stored in Orama, which handles full-text, vector, and hybrid search in a single library.
4. File metadata is tracked in SQLite (via bun:sqlite) so unchanged files are skipped on restart.
5. Each search request checks for stale files and triggers a background reindex if needed.
6. The MCP server exposes five tools over stdio: `search_docs`, `list_docs`, `get_doc`, `reindex_docs`, and `sextant_status`.

The entire stack runs locally with no external services. There are no native modules; everything is pure JavaScript/TypeScript.

### Index freshness

Sextant keeps its index up to date automatically:

- On startup, Sextant compares every file's modification time against what was previously indexed. New and changed files are re-indexed; deleted files are removed from the index. This covers cases where docs were updated while the server was not running (for example, after a `git pull`).
- On each search, a freshness check detects new, modified, or deleted files and triggers a background reindex without blocking the query. If files have changed, the response includes a note and results update on the next search.
- If another Sextant process has persisted a newer index to disk, it is picked up automatically before searching.

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
ollama pull nomic-embed-text
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
      "args": ["@tideshift/sextant"],
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
- **sextant_status** - Check server health, indexing progress, Ollama connectivity, and index statistics.

## Configuration

All settings can be configured through environment variables or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `DOCS_PATH` | `./docs` | Path to the markdown folder to index |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Ollama embedding model name |
| `EMBEDDING_DIMS` | `768` | Embedding vector dimensions (must match model) |
| `DATA_PATH` | `.sextant` | Where to store the index and metadata |
| `MAX_CHUNK_TOKENS` | `512` | Maximum chunk size (estimated as chars / 4) |
| `DEFAULT_TOP_K` | `10` | Default number of search results |
| `HYBRID_WEIGHT_TEXT` | `0.5` | Weight for keyword matching in hybrid mode |
| `HYBRID_WEIGHT_VECTOR` | `0.5` | Weight for semantic matching in hybrid mode |

## Contributing

See [docs/contributing.md](docs/contributing.md) for local development setup, building, and diagnostics.

## Technical details

See [docs/technical_details.md](docs/technical_details.md) for architecture, project structure, chunking strategy, persistence model, index freshness logic, and edge cases.

## License

Made with ❤️ in Vancouver, BC by Tideshift Labs, developed using [Claude Code](https://claude.ai/code).

[MIT](LICENSE)
