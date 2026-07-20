import type { z } from 'zod';

/** A cached value with its timestamps. */
export interface CacheEntry<T> {
  readonly value: T;
  /** Epoch ms when the entry was stored. */
  readonly storedAt: number;
  /** Epoch ms after which the entry is considered stale. */
  readonly expiresAt: number;
}

/**
 * Port for the local key-value cache. Synchronous by design: the backing
 * store (better-sqlite3) is synchronous and CLI latency benefits from it.
 * Values are JSON-serialized and validated against the given schema on
 * read — corrupt entries behave as cache misses.
 */
export interface CacheStore {
  /** Returns the parsed value when present and not expired; undefined otherwise. */
  get<T>(key: string, schema: z.ZodType<T>): T | undefined;

  /** Returns the entry regardless of expiry (stale-while-revalidate). */
  getStale<T>(key: string, schema: z.ZodType<T>): CacheEntry<T> | undefined;

  /** Stores a value with a TTL in milliseconds. */
  set<T>(key: string, value: T, ttlMs: number): void;

  delete(key: string): void;

  /** Removes all expired entries; returns how many were removed. */
  clearExpired(): number;

  clearAll(): void;
}
