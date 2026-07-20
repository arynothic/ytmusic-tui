import type { Database } from 'better-sqlite3';

import { CacheError } from '@/core/errors';

/** A single, idempotent schema migration. */
export interface Migration {
  /** Monotonic version; applied in ascending order. */
  readonly version: number;
  readonly name: string;
  readonly up: (db: Database) => void;
}

/**
 * Applies pending migrations, tracking progress in `PRAGMA user_version`.
 * Each migration runs in a transaction; failures abort that migration and
 * surface as {@link CacheError} with the database left at its last good
 * version.
 */
export function migrateDatabase(db: Database, migrations: readonly Migration[]): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = migrations
    .filter((migration) => migration.version > current)
    .sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    const run = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${String(migration.version)}`);
    });
    try {
      run();
    } catch (error) {
      throw new CacheError(
        'CACHE_QUERY_FAILED',
        `Migration ${String(migration.version)} (${migration.name}) failed`,
        { cause: error },
      );
    }
  }
}
