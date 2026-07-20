import Database from 'better-sqlite3';

import { CacheError } from '@/core/errors';

/**
 * Opens (creating when needed) a SQLite database with pragmas suited for
 * a local CLI workload: WAL for crash safety, NORMAL synchronous for
 * speed, foreign keys on principle.
 * Throws {@link CacheError} when the file cannot be opened.
 */
export function openDatabase(file: string): Database.Database {
  try {
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    return db;
  } catch (error) {
    throw new CacheError('CACHE_OPEN_FAILED', `Failed to open database ${file}`, {
      cause: error,
    });
  }
}
