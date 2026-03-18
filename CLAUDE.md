# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sextant is an MCP (Model Context Protocol) server that provides hybrid semantic and keyword search over local markdown documentation. Built with Bun and TypeScript. Requires Ollama running locally for embeddings.

## Commands

```bash
bun install                       # Install dependencies
bun dev                           # Start MCP server (stdio transport)
bun run build                     # Compile to standalone executable at dist/docs-mcp-server
bunx tsc --noEmit                 # Type check (no linter configured)
bun test                          # Run tests (Bun test runner)
bun run src/scripts/diag.ts       # Diagnostics: verify Ollama, embeddings, search
```

## Architecture

Three-layer design: **MCP Tools → Indexer → Store**

### Store Layer (`src/store/`)
- `orama-store.ts` — In-memory Orama search index (BM25 + vector cosine similarity)
- `metadata-db.ts` — SQLite (`bun:sqlite`) tracking per-file metadata (mtime, hash)
- `persistence.ts` — Atomic save/load of Orama index to disk (temp-then-rename)

### Indexer Layer (`src/indexer/`)
- `pipeline.ts` — Orchestrates: scan files → chunk → embed → store
- `chunker.ts` — Splits markdown at heading boundaries, parses frontmatter, handles code fences, produces `DocChunk` objects with deterministic SHA256 IDs
- `embedder.ts` — Calls Ollama `/api/embed` in batches with retry/backoff
- `freshness.ts` — Per-search staleness detection comparing mtimes against metadata DB; triggers background reindex
- `state.ts` — State machine: `idle → indexing → ready`, with `error` and cancellation support

### MCP Tools Layer (`src/tools/`)
Five tools exposed via MCP: `search_docs`, `list_docs`, `get_doc`, `reindex_docs`, `sextant_status`

### Wiring
- `src/index.ts` — Entry point, wires layers together and starts server
- `src/server.ts` — MCP server definition, registers tool handlers
- `src/config.ts` — Loads env vars with defaults (see `.env.example` for full list)

## Key Design Decisions

- **MCP server starts on stdio immediately**, before indexing completes — clients can connect right away
- **Incremental reindexing** — only changed files (by mtime) are re-embedded
- **Graceful degradation** — falls back to keyword-only search if Ollama is unreachable
- **Dual database** — Orama for search, SQLite for metadata; `persistence.ts` validates embedding dimensions on load and auto-rebuilds on mismatch
- **Background freshness** — search results include a staleness note when reindex is in progress; searches are never blocked
- `.sextant/` directory (configurable via `DATA_PATH`) stores `orama.bin` and `metadata.db` at runtime; auto-added to `.gitignore`

## Configuration

All config is via environment variables (see `src/config.ts` and `.env.example`). Key ones:
- `DOCS_PATH` (default `./docs`) — markdown folder to index
- `OLLAMA_URL` (default `http://localhost:11434`) — Ollama endpoint
- `EMBEDDING_MODEL` (default `nomic-embed-text`) — model name, must match `EMBEDDING_DIMS` (default 768)
