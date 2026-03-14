import path from 'path';
import { config } from '../config.ts';
import { saveIndex, loadIndex, initStore, getSchema } from './orama-store.ts';
import { create, load } from '@orama/orama';

const ORAMA_PATH = path.join(config.dataPath, 'orama.bin');

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export async function persistToDisk(): Promise<void> {
  try {
    const data = await saveIndex();
    await Bun.write(ORAMA_PATH, JSON.stringify(data));
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
