import path from 'path';
import { readFileSync, writeFileSync, unlinkSync, existsSync, renameSync } from 'fs';
import { config } from './config.ts';

const LOCK_FILE = path.join(config.dataPath, 'watcher.lock');
const STALE_LOCK_MS = 60_000; // consider lock stale after 60s without heartbeat

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let ownsLock = false;

/**
 * Try to acquire the watcher lock.
 * Returns true if this process is now the primary (watcher + indexer).
 * Returns false if another live instance already holds the lock.
 */
export async function tryAcquireLock(): Promise<boolean> {
  if (existsSync(LOCK_FILE)) {
    try {
      const data = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
      const age = Date.now() - data.heartbeat;

      if (age < STALE_LOCK_MS && data.pid && isProcessAlive(data.pid)) {
        // Another live instance holds the lock
        return false;
      }

      if (age >= STALE_LOCK_MS) {
        console.error('[lock] Taking over stale lock');
      } else {
        console.error(`[lock] Lock holder (pid ${data.pid}) is no longer running, taking over`);
      }
    } catch {
      console.error('[lock] Corrupt lock file, taking over');
    }
  }

  writeLockData();
  startHeartbeat();
  ownsLock = true;

  // Verify we actually won (handles near-simultaneous startup race)
  await Bun.sleep(50);
  try {
    const data = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
    if (data.pid !== process.pid) {
      // Another process won the race
      stopHeartbeat();
      ownsLock = false;
      return false;
    }
  } catch {
    // If we can't read it back, assume we lost
    stopHeartbeat();
    ownsLock = false;
    return false;
  }

  return true;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeLockData(): void {
  // Atomic write via temp+rename to prevent torn reads by other instances
  const tempPath = LOCK_FILE + '.tmp';
  writeFileSync(tempPath, JSON.stringify({ pid: process.pid, heartbeat: Date.now() }));
  renameSync(tempPath, LOCK_FILE);
}

function startHeartbeat(): void {
  heartbeatTimer = setInterval(() => {
    try {
      writeLockData();
    } catch {
      // Ignore write failures
    }
  }, 10_000);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export async function releaseLock(): Promise<void> {
  stopHeartbeat();
  if (ownsLock) {
    try {
      unlinkSync(LOCK_FILE);
    } catch {
      // Already gone
    }
    ownsLock = false;
  }
}
