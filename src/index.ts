#!/usr/bin/env bun
import { mkdirSync } from 'fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.ts';
import { initMetadataDb, closeMetadataDb } from './store/metadata-db.ts';
import { initStore } from './store/orama-store.ts';
import { loadFromDisk, flushPersist } from './store/persistence.ts';
import { indexAll } from './indexer/pipeline.ts';
import { startWatcher } from './indexer/watcher.ts';
import { createMcpServer, setIsPrimary } from './server.ts';
import { tryAcquireLock, releaseLock } from './lock.ts';

async function main() {
  console.error('[startup] sextant starting...');
  console.error(`[startup] Docs path: ${config.docsPath}`);
  console.error(`[startup] Data path: ${config.dataPath}`);

  // Ensure directories exist
  mkdirSync(config.dataPath, { recursive: true });
  mkdirSync(config.docsPath, { recursive: true });

  // Initialize metadata DB
  initMetadataDb();
  console.error('[startup] Metadata DB initialized');

  // Determine if this is the primary instance (owns watcher + indexing)
  const isPrimary = await tryAcquireLock();
  setIsPrimary(isPrimary);

  if (isPrimary) {
    console.error('[startup] Primary instance (owns watcher + indexing)');
  } else {
    console.error('[startup] Secondary instance (read-only, reloads from disk on demand)');
  }

  // Initialize Orama store - try loading from disk first
  const loaded = await loadFromDisk();
  if (!loaded) {
    await initStore();
    console.error('[startup] Created fresh Orama index');
  }

  // Only the primary instance indexes and watches
  let watcher: ReturnType<typeof startWatcher> | null = null;

  if (isPrimary) {
    // Index all docs (skips unchanged files if loaded from disk)
    try {
      const stats = await indexAll(config.docsPath);
      console.error(`[startup] Indexing complete: ${stats.filesProcessed} files, ${stats.chunksCreated} chunks in ${stats.duration}ms`);
    } catch (err) {
      console.error('[startup] Initial indexing failed (server will still start):', err);
    }

    // Start file watcher
    if (config.watchEnabled) {
      watcher = startWatcher(config.docsPath);
    }
  }

  // Start MCP server
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[startup] MCP server running on stdio');

  // Graceful shutdown
  const shutdown = async () => {
    console.error('[shutdown] Shutting down...');
    if (watcher) {
      await watcher.close();
    }
    if (isPrimary) {
      await flushPersist();
      await releaseLock();
    }
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
