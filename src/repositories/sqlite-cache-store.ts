import type { Database } from 'better-sqlite3';
import type { z } from 'zod';

import type { Migration } from '@/cache/migrations';
import { isExpired } from '@/cache/ttl';
import { CacheError } from '@/core/errors';
import type { CacheEntry, CacheStore } from '@/core/ports';

interface CacheRow {
  value: string;
  stored_at: number;
  expires_at: number;
}

/** Migration creating the cache_entries table (cache.db version 1). */
export const cacheEntriesMigration: Migration = {
  version: 1,
  name: 'create cache_entries',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        stored_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries (expires_at);
    `);
  },
};

/**
 * SQLite-backed {@link CacheStore}. Corrupt rows (unparseable JSON or
 * schema mismatch) are deleted and reported as misses — a cache must
 * never break the application. SQL failures throw {@link CacheError}.
 */
export class SqliteCacheStore implements CacheStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  get<T>(key: string, schema: z.ZodType<T>): T | undefined {
    const entry = this.getStale(key, schema);
    if (entry === undefined || isExpired(entry.expiresAt)) {
      return undefined;
    }
    return entry.value;
  }

  getStale<T>(key: string, schema: z.ZodType<T>): CacheEntry<T> | undefined {
    const row = this.#queryRow(key);
    if (row === undefined) {
      return undefined;
    }
    const value = parseRowValue(row.value, schema);
    if (value === undefined) {
      this.delete(key);
      return undefined;
    }
    return { value, storedAt: row.stored_at, expiresAt: row.expires_at };
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    const now = Date.now();
    this.#run(
      'INSERT OR REPLACE INTO cache_entries (key, value, stored_at, expires_at) VALUES (?, ?, ?, ?)',
      key,
      JSON.stringify(value),
      now,
      now + ttlMs,
    );
  }

  delete(key: string): void {
    this.#run('DELETE FROM cache_entries WHERE key = ?', key);
  }

  clearExpired(): number {
    try {
      return this.#db.prepare('DELETE FROM cache_entries WHERE expires_at <= ?').run(Date.now())
        .changes;
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to clear expired cache entries', {
        cause: error,
      });
    }
  }

  clearAll(): void {
    this.#run('DELETE FROM cache_entries');
  }

  #queryRow(key: string): CacheRow | undefined {
    try {
      return this.#db
        .prepare('SELECT value, stored_at, expires_at FROM cache_entries WHERE key = ?')
        .get(key) as CacheRow | undefined;
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to read from cache', { cause: error });
    }
  }

  #run(sql: string, ...params: unknown[]): void {
    try {
      this.#db.prepare(sql).run(...params);
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to write to cache', { cause: error });
    }
  }
}

/** Parses and validates a stored JSON payload; undefined when corrupt. */
function parseRowValue<T>(raw: string, schema: z.ZodType<T>): T | undefined {
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
