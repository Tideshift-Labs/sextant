import { Database } from 'bun:sqlite';
import path from 'path';
import { config } from '../config.ts';
import type { IndexedFile } from '../indexer/types.ts';

let db: Database | null = null;

export function initMetadataDb(): Database {
  const dbPath = path.join(config.dataPath, 'metadata.db');
  db = new Database(dbPath);
  db.run('PRAGMA journal_mode = WAL');
  db.run(`
    CREATE TABLE IF NOT EXISTS indexed_files (
      filePath TEXT PRIMARY KEY,
      lastModified INTEGER NOT NULL,
      chunkCount INTEGER NOT NULL,
      title TEXT,
      category TEXT,
      indexedAt INTEGER NOT NULL
    )
  `);
  return db;
}

export function getMetadataDb(): Database {
  if (!db) throw new Error('Metadata DB not initialized. Call initMetadataDb() first.');
  return db;
}

export function upsertFile(
  filePath: string,
  lastModified: number,
  chunkCount: number,
  title: string | null,
  category: string | null
): void {
  const d = getMetadataDb();
  d.query(
    `INSERT OR REPLACE INTO indexed_files (filePath, lastModified, chunkCount, title, category, indexedAt)
     VALUES ($filePath, $lastModified, $chunkCount, $title, $category, $indexedAt)`
  ).run({
    $filePath: filePath,
    $lastModified: lastModified,
    $chunkCount: chunkCount,
    $title: title,
    $category: category,
    $indexedAt: Date.now(),
  });
}

export function getFile(filePath: string): IndexedFile | null {
  const d = getMetadataDb();
  return d.query('SELECT * FROM indexed_files WHERE filePath = $filePath').get({
    $filePath: filePath,
  }) as IndexedFile | null;
}

export function removeFile(filePath: string): void {
  const d = getMetadataDb();
  d.query('DELETE FROM indexed_files WHERE filePath = $filePath').run({
    $filePath: filePath,
  });
}

export function listFiles(category?: string): IndexedFile[] {
  const d = getMetadataDb();
  if (category) {
    return d.query('SELECT * FROM indexed_files WHERE category = $category ORDER BY filePath').all({
      $category: category,
    }) as IndexedFile[];
  }
  return d.query('SELECT * FROM indexed_files ORDER BY filePath').all() as IndexedFile[];
}

export function getAllFiles(): IndexedFile[] {
  const d = getMetadataDb();
  return d.query('SELECT * FROM indexed_files ORDER BY filePath').all() as IndexedFile[];
}

export function clearAll(): void {
  const d = getMetadataDb();
  d.run('DELETE FROM indexed_files');
}

export function closeMetadataDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
