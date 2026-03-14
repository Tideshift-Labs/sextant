# Contributing

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

The server logs to stderr. On first run it will index all markdown files and persist the index to `.sextant/`. On subsequent starts it loads the persisted index and only re-indexes files that have changed.

## Building a standalone executable

Bun can compile the server into a single executable that includes the runtime:

```bash
bun run build
```

This produces `dist/docs-mcp-server` (or `.exe` on Windows). The executable can be distributed and run without Bun installed on the target machine.

## Diagnostics

Run the built-in diagnostic script to verify Ollama connectivity, embedding dimensions, and search functionality:

```bash
bun run src/scripts/diag.ts
```

## Type checking

```bash
bunx tsc --noEmit
```
