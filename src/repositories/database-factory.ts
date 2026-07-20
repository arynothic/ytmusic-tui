import type { Database } from 'better-sqlite3';

import { openDatabase } from '@/cache/database';
import { migrateDatabase } from '@/cache/migrations';
import { cacheEntriesMigration } from '@/repositories/sqlite-cache-store';
import { historyEntriesMigration } from '@/repositories/sqlite-history-store';
import { savedQueuesMigration } from '@/repositories/sqlite-queue-store';

/**
 * Opens cache.db, applying the ordered migrations of every store that
 * lives in it (they share the database-wide `user_version`).
 */
export function openCacheDatabase(file: string): Database {
  const db = openDatabase(file);
  migrateDatabase(db, [cacheEntriesMigration, savedQueuesMigration]);
  return db;
}

/** Opens history.db, applying its migrations. */
export function openHistoryDatabase(file: string): Database {
  const db = openDatabase(file);
  migrateDatabase(db, [historyEntriesMigration]);
  return db;
}
