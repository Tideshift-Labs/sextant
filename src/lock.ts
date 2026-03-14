import path from 'path';
import { config } from './config.ts';

const LOCK_FILE = path.join(config.dataPath, 'watcher.lock');
const STALE_LOCK_MS = 30_000; // consider lock stale after 30s without heartbeat

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Try to acquire the watcher lock. Returns true if this process
 * is now the primary (watcher + indexer). Returns false if another
 * instance already holds the lock.
 */
export async function tryAcquireLock(): Promise<boolean> {
  const file = Bun.file(LOCK_FILE);

  if (await file.exists()) {
    try {
      const data = JSON.parse(await file.text());
      const age = Date.now() - data.heartbeat;
      if (age < STALE_LOCK_MS) {
        // Another live instance holds the lock
        return false;
      }
      // Lock is stale, take it over
      console.error('[lock] Taking over stale lock');
    } catch {
      // Corrupt lock file, take it over
    }
  }

  await writeLock();
  startHeartbeat();
  return true;
}

async function writeLock(): Promise<void> {
  await Bun.write(LOCK_FILE, JSON.stringify({
    pid: process.pid,
    heartbeat: Date.now(),
  }));
}

function startHeartbeat(): void {
  heartbeatTimer = setInterval(async () => {
    try {
      await writeLock();
    } catch {
      // Ignore write failures
    }
  }, 10_000);
}

export async function releaseLock(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(LOCK_FILE);
  } catch {
    // Already gone
  }
}
