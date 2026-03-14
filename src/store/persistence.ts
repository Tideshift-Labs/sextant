import path from 'path';
import { config } from '../config.ts';
import { saveIndex, loadIndex, initStore } from './orama-store.ts';

const ORAMA_PATH = path.join(config.dataPath, 'orama.bin');

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastKnownMtimeMs = 0;

export async function persistToDisk(): Promise<void> {
  try {
    const data = await saveIndex();
    await Bun.write(ORAMA_PATH, JSON.stringify(data));
    // Track mtime so we know this write is ours
    const stat = await Bun.file(ORAMA_PATH).stat();
    if (stat) lastKnownMtimeMs = stat.mtimeMs;
    console.error('[persistence] Index saved to disk');
  } catch (err) {
    console.error('[persistence] Failed to save index:', err);
  }
}

export function debouncedPersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistToDisk().catch((err) => console.error('[persistence] Debounced persist failed:', err));
  }, config.persistDebounceMs);
}

export async function loadFromDisk(): Promise<boolean> {
  try {
    const file = Bun.file(ORAMA_PATH);
    if (await file.exists()) {
      const data = JSON.parse(await file.text());
      await loadIndex(data);
      const stat = await file.stat();
      if (stat) lastKnownMtimeMs = stat.mtimeMs;
      console.error('[persistence] Index loaded from disk');
      return true;
    }
  } catch (err) {
    console.error('[persistence] Failed to load index from disk, starting fresh:', err);
  }
  return false;
}

/**
 * Check if the on-disk index has been updated by another instance.
 * If so, reload it into memory. Called by secondary (non-watcher) instances
 * before serving searches to stay fresh.
 */
export async function reloadIfChanged(): Promise<boolean> {
  try {
    const file = Bun.file(ORAMA_PATH);
    if (!(await file.exists())) return false;

    const stat = await file.stat();
    if (!stat || stat.mtimeMs <= lastKnownMtimeMs) return false;

    console.error('[persistence] Index changed on disk, reloading...');
    const data = JSON.parse(await file.text());
    await loadIndex(data);
    lastKnownMtimeMs = stat.mtimeMs;
    return true;
  } catch (err) {
    console.error('[persistence] Failed to reload index:', err);
    return false;
  }
}

export async function flushPersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await persistToDisk();
}
