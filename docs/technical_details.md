# Technical Details

This document covers how Sextant works under the hood, the edge cases it handles, and the design decisions behind them.

## Architecture overview

Sextant is structured in three layers:

```
MCP Tools (search, list, get, reindex, status)
    |
Indexer (pipeline, chunker, embedder, freshness, state)
    |
Store (orama-store, metadata-db, persistence)
```

**Tools** handle MCP requests from the client. **Indexer** turns markdown files into embedded chunks. **Store** holds the search index (Orama) and file metadata (SQLite), with persistence to disk.

The MCP server starts on stdio immediately at boot, before indexing finishes. This lets clients issue tool calls right away while the initial index builds in the background.

## Chunking

Markdown files are split into chunks at heading boundaries (`#` through `######`). Each chunk carries its full heading hierarchy for context (e.g., `["Architecture", "Networking", "UDP"]`).

### Frontmatter

YAML-style frontmatter between `---` delimiters is parsed for `title`, `category`, and `tags`. These override the defaults derived from the file path.

### Category inference

If frontmatter doesn't specify a category, it's inferred from the directory structure: `architecture/networking.md` gets category `architecture`. Files in the root directory get category `root`.

### Oversized chunks

When a heading section exceeds `MAX_CHUNK_TOKENS * 4` characters (~512 tokens):

1. Split by paragraphs (double newlines)
2. If a single paragraph still exceeds the limit, split by lines
3. If a single line exceeds the limit, hard-truncate it

Adjacent sub-chunks get `CHUNK_OVERLAP_LINES` (default 2) lines of overlap to preserve context across boundaries.

### Chunk IDs

Each chunk gets a deterministic ID: `SHA256(filePath + "::" + content)`, truncated to 16 hex characters. This means the same content in different files produces different IDs, and editing a chunk's content produces a new ID.

### Code blocks

Headings inside fenced code blocks (`` ``` ``) are not treated as section boundaries. The chunker tracks fence open/close state to avoid false splits.

## Embedding

Chunks are embedded through Ollama's `/api/embed` endpoint using a locally-hosted model (default: `nomic-embed-text`).

### Instruction prefixes

Following the nomic-embed-text convention, document chunks are prefixed with `"search_document: "` and queries with `"search_query: "`. This improves retrieval quality by telling the model whether text is a document or a query. These prefixes are configurable via `INDEX_INSTRUCTION` and `QUERY_INSTRUCTION`.

### Batching

Embeddings are processed in batches of `EMBEDDING_BATCH_SIZE` (default 32) to avoid overwhelming Ollama with large requests.

### Retry logic

Failed embedding calls retry up to 3 times with exponential backoff (500ms, 1s, 2s). If Ollama is completely unreachable, the error message tells the user which model to pull.

### Graceful degradation

If Ollama is down:
- **Hybrid search** falls back to keyword-only
- **Semantic search** returns an error (embeddings are required)
- **Keyword search** works normally (no embeddings needed)

## Search

Sextant supports three search modes, all powered by Orama:

- **Hybrid** (default): combines BM25 keyword scoring with vector cosine similarity, weighted by `HYBRID_WEIGHT_TEXT` and `HYBRID_WEIGHT_VECTOR`
- **Semantic**: vector similarity only
- **Keyword**: full-text BM25 only

Results can be filtered by category and are capped at `top_k` (default 10, max 30).

## Persistence

The Orama index is serialized to JSON and saved at `{DATA_PATH}/orama.bin`. File metadata lives in a SQLite database at `{DATA_PATH}/metadata.db`.

### Atomic writes

Index persistence uses a write-to-temp-then-rename pattern: data is written to `orama.bin.tmp`, then renamed to `orama.bin`. This prevents torn reads if another process tries to load the index mid-write.

### Dimension validation

On load, the persisted index is validated against the configured `EMBEDDING_DIMS`. If there's a mismatch (e.g., the user switched models), the entire index is discarded and rebuilt from scratch. This prevents corrupted search results from mixed-dimension vectors.

### Debounced persistence

During indexing, `persistToDisk()` is debounced by `PERSIST_DEBOUNCE_MS` (default 5s) to avoid excessive disk writes.

## Index freshness

Sextant detects stale documentation and self-heals without blocking search.

### On startup

`indexAll()` runs as a background task immediately after the MCP server starts. It compares every file's `mtime` against the metadata DB and only re-embeds files that changed. Deleted files are detected by comparing the disk file list against the indexed file list, and their chunks are removed.

### On each search

Before executing a search, `checkAndReindex()` runs a freshness check:

1. Calls `reloadIfChanged()` to pick up any index updates persisted by another process
2. Scans `*.md` files on disk and compares against the metadata DB
3. Counts new files, modified files (mtime > indexed mtime), and deleted files
4. If nothing changed: search proceeds normally
5. If changes found: fires off `indexAll()` in the background (non-blocking) and prepends a note to the search response: *"N file(s) changed since last index. Background reindex started."*
6. If a reindex is already running: search proceeds against the current index without starting a duplicate

The search always returns immediately against the current in-memory index. The background reindex updates the index for subsequent queries.

### Deletion persistence

When files are deleted and no other files need updating, `indexAll()` still persists the index to disk. Without this, deleted file chunks would reappear on the next process restart (the in-memory Orama index would be clean, but `orama.bin` on disk would still contain the old chunks, while SQLite had already committed the metadata removal).

## Incremental reindexing

`indexAll()` is incremental by default:

1. Scan disk for all `*.md` files
2. Remove indexed files that no longer exist on disk (chunks + metadata)
3. For each file on disk, compare `mtime` against metadata DB
4. Skip files where `mtime <= indexed mtime`
5. Re-chunk and re-embed only changed files
6. Remove old chunks for changed files before inserting new ones
7. Persist to disk

The `reindex_docs` tool can optionally do a full reindex by clearing the existing index first.

## Indexing state machine

```
idle --> indexing --> ready
             \-----> error
```

The state tracks files found, files processed, current file, and timestamps. `status === 'indexing'` serves as an in-process mutex: `checkAndReindex()` won't start a second indexing run if one is already in progress. `fullReindex()` also checks this guard.

Indexing supports graceful cancellation via `requestCancel()`. The pipeline checks `isCancelRequested()` between files and exits early if set. This is used during shutdown to avoid blocking the process.

## Startup and shutdown

### Startup sequence

1. Create data directories (`DATA_PATH`, `DOCS_PATH`) if missing
2. Add `.sextant/` to `.gitignore` / `.ignore` if those files exist
3. Initialize SQLite metadata DB
4. Load persisted Orama index from disk (or create fresh)
5. Start MCP server on stdio (clients can connect immediately)
6. Run `indexAll()` in background

### Shutdown sequence

1. Signal cancellation to any running indexing
2. Wait up to 2 seconds for indexing to finish gracefully
3. Flush any pending persistence to disk
4. Close metadata DB
5. Exit

## Configuration reference

All settings are configured via environment variables or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `DOCS_PATH` | `./docs` | Path to the markdown folder to index |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Ollama embedding model name |
| `EMBEDDING_DIMS` | `768` | Embedding vector dimensions (must match model) |
| `DATA_PATH` | `.sextant` | Where to store the index and metadata |
| `MAX_CHUNK_TOKENS` | `512` | Maximum chunk size (estimated as chars / 4) |
| `CHUNK_OVERLAP_LINES` | `2` | Lines of overlap between sub-chunks |
| `DEFAULT_TOP_K` | `10` | Default number of search results |
| `HYBRID_WEIGHT_TEXT` | `0.5` | Weight for keyword matching in hybrid mode |
| `HYBRID_WEIGHT_VECTOR` | `0.5` | Weight for semantic matching in hybrid mode |
| `SIMILARITY_THRESHOLD` | `0.5` | Minimum vector similarity score |
| `INDEX_INSTRUCTION` | `search_document: ` | Prefix for document embeddings |
| `QUERY_INSTRUCTION` | `search_query: ` | Prefix for query embeddings |
| `PERSIST_DEBOUNCE_MS` | `5000` | Debounce interval for index persistence |
| `EMBEDDING_BATCH_SIZE` | `32` | Number of texts to embed per Ollama call |
