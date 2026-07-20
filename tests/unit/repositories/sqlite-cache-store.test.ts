import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CacheError } from '@/core/errors';
import { TrackSchema } from '@/models';
import { openCacheDatabase, SqliteCacheStore } from '@/repositories';

import { createTrackFixture } from '../../helpers/fixtures';
import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('SqliteCacheStore', () => {
  let directory: string;
  let dbFile: string;
  let store: SqliteCacheStore;

  beforeEach(async () => {
    directory = await createTempDir();
    dbFile = join(directory, 'cache.db');
    store = new SqliteCacheStore(openCacheDatabase(dbFile));
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('round-trips values through set/get', () => {
    const track = createTrackFixture();
    store.set('track:1', track, 60_000);
    expect(store.get('track:1', TrackSchema)).toEqual(track);
  });

  it('returns undefined for missing keys', () => {
    expect(store.get('nope', TrackSchema)).toBeUndefined();
    expect(store.getStale('nope', TrackSchema)).toBeUndefined();
  });

  it('treats expired entries as misses but keeps them for stale reads', () => {
    store.set('old', { a: 1 }, -1000);
    const schema = z.object({ a: z.number() });
    expect(store.get('old', schema)).toBeUndefined();
    const stale = store.getStale('old', schema);
    expect(stale?.value).toEqual({ a: 1 });
    expect(stale?.expiresAt).toBeLessThan(Date.now());
  });

  it('deletes corrupt rows and reports a miss', () => {
    const db = openCacheDatabase(dbFile);
    db.prepare(
      "INSERT INTO cache_entries (key, value, stored_at, expires_at) VALUES ('bad', '{oops', 0, 9999999999999)",
    ).run();
    expect(store.get('bad', TrackSchema)).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) AS n FROM cache_entries WHERE key = 'bad'").get()).toEqual({
      n: 0,
    });
    db.close();
  });

  it('deletes rows that fail schema validation', () => {
    store.set('wrong-shape', { totally: 'different' }, 60_000);
    expect(store.get('wrong-shape', TrackSchema)).toBeUndefined();
    expect(store.getStale('wrong-shape', TrackSchema)).toBeUndefined();
  });

  it('clears only expired entries', () => {
    store.set('expired', 1, -1000);
    store.set('fresh', 2, 60_000);
    expect(store.clearExpired()).toBe(1);
    expect(store.get('fresh', z.number())).toBe(2);
  });

  it('clears all entries', () => {
    store.set('a', 1, 60_000);
    store.set('b', 2, 60_000);
    store.clearAll();
    expect(store.get('a', z.number())).toBeUndefined();
    expect(store.get('b', z.number())).toBeUndefined();
  });

  it('persists across reopening the database (idempotent migrations)', () => {
    store.set('persisted', 'value', 60_000);
    const reopened = new SqliteCacheStore(openCacheDatabase(dbFile));
    expect(reopened.get('persisted', z.string())).toBe('value');
  });

  it('throws CacheError when the database is closed underneath', () => {
    const db = openCacheDatabase(dbFile);
    const broken = new SqliteCacheStore(db);
    db.close();
    expect(() => broken.get('x', z.string())).toThrowError(CacheError);
    expect(() => broken.set('x', 1, 1000)).toThrowError(CacheError);
  });
});
