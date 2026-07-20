import type { z } from 'zod';

import type { CacheEntry, CacheStore } from '@/core/ports';

/** In-memory CacheStore fake mirroring SqliteCacheStore semantics. */
export class MockCacheStore implements CacheStore {
  readonly data = new Map<string, { value: unknown; storedAt: number; expiresAt: number }>();

  get<T>(key: string, schema: z.ZodType<T>): T | undefined {
    const entry = this.getStale(key, schema);
    if (entry === undefined || entry.expiresAt <= Date.now()) {
      return undefined;
    }
    return entry.value;
  }

  getStale<T>(key: string, schema: z.ZodType<T>): CacheEntry<T> | undefined {
    const row = this.data.get(key);
    if (row === undefined) {
      return undefined;
    }
    const parsed = schema.safeParse(row.value);
    if (!parsed.success) {
      this.data.delete(key);
      return undefined;
    }
    return { value: parsed.data, storedAt: row.storedAt, expiresAt: row.expiresAt };
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.data.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  clearExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.data) {
      if (entry.expiresAt <= now) {
        this.data.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clearAll(): void {
    this.data.clear();
  }
}
