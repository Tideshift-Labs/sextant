import path from 'path';
import { rename } from 'fs/promises';
import { config } from '../config.ts';
import { saveIndex, loadIndex, initStore, getStore } from './orama-store.ts';
import { search } from '@orama/orama';
import { clearAll as clearMetadata } from './metadata-db.ts';

const ORAMA_PATH = path.join(config.dataPath, 'orama.bin');

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastKnownMtimeMs = 0;

export async function persistToDisk(): Promise<void> {
  try {
    const data = await saveIndex();
    // Atomic write: write to temp file, then rename to avoid torn reads by concurrent instances
    const tempPath = ORAMA_PATH + '.tmp';
    await Bun.write(tempPath, JSON.stringify(data));
    await rename(tempPath, ORAMA_PATH);
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

      // Validate that the stored index dimensions match the current config
      const probe = new Float32Array(config.embeddingDims);
      try {
        await search(getStore(), {
          mode: 'vector',
          vector: { value: Array.from(probe), property: 'embedding' },
          limit: 1,
        } as any);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('dimensional')) {
          console.error(`[persistence] Dimension mismatch in stored index, discarding stale data`);
          await initStore();
          clearMetadata();
          return false;
        }
        // Other errors are fine (e.g. empty index)
      }

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

export async function flushPersist(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await persistToDisk();
}
