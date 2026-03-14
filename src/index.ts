#!/usr/bin/env bun
import { mkdirSync } from 'fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.ts';
import { initMetadataDb, closeMetadataDb } from './store/metadata-db.ts';
import { initStore } from './store/orama-store.ts';
import { loadFromDisk, flushPersist } from './store/persistence.ts';
import { indexAll } from './indexer/pipeline.ts';
import { requestCancel } from './indexer/state.ts';
import { createMcpServer } from './server.ts';
import { ensureIgnored } from './ignore-files.ts';

async function main() {
  console.error('[startup] sextant starting...');
  console.error(`[startup] Docs path: ${config.docsPath}`);
  console.error(`[startup] Data path: ${config.dataPath}`);

  // Ensure directories exist
  mkdirSync(config.dataPath, { recursive: true });
  mkdirSync(config.docsPath, { recursive: true });

  // Add .sextant/ to ignore files if they exist in cwd
  ensureIgnored(process.cwd());

  // Initialize metadata DB
  initMetadataDb();
  console.error('[startup] Metadata DB initialized');

  // Load persisted index from disk, or create fresh
  const loaded = await loadFromDisk();
  if (!loaded) {
    await initStore();
    console.error('[startup] Created fresh Orama index');
  }

  // Start MCP server immediately so the connection is available while indexing
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[startup] MCP server running on stdio');

  // Run incremental reindex in background (only re-embeds changed files)
  const indexingPromise = indexAll(config.docsPath)
    .then((stats) => {
      console.error(`[startup] Indexing complete: ${stats.filesProcessed} files, ${stats.chunksCreated} chunks in ${stats.duration}ms`);
    })
    .catch((err) => {
      console.error('[startup] Initial indexing failed (server keeps running):', err);
    });

  // Graceful shutdown
  const shutdown = async () => {
    console.error('[shutdown] Shutting down...');
    requestCancel();
    // Give indexing up to 2s to finish gracefully
    await Promise.race([indexingPromise, Bun.sleep(2000)]);
    await flushPersist();
    closeMetadataDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
