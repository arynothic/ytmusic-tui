import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { QueueSnapshotSchema, type QueueSnapshot } from '@/models';
import { openCacheDatabase, SqliteQueueStore } from '@/repositories';

import { createTrackFixture } from '../../helpers/fixtures';
import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('SqliteQueueStore', () => {
  let directory: string;
  let dbFile: string;
  let store: SqliteQueueStore;

  beforeEach(async () => {
    directory = await createTempDir();
    dbFile = join(directory, 'cache.db');
    store = new SqliteQueueStore(openCacheDatabase(dbFile));
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  const createSnapshot = (name: string, savedAt: string, trackIds: string[]): QueueSnapshot =>
    QueueSnapshotSchema.parse({
      version: 1,
      name,
      savedAt,
      queue: {
        items: trackIds.map((id, index) => ({
          id: `q${String(index)}`,
          track: createTrackFixture({ id, title: `Song ${id}` }),
        })),
        currentIndex: 0,
        shuffle: false,
        repeat: 'off',
      },
    });

  it('round-trips a saved queue', () => {
    const snapshot = createSnapshot('roadtrip', '2026-07-20T10:00:00.000Z', ['a', 'b']);
    store.save('roadtrip', snapshot);
    expect(store.load('roadtrip')).toEqual(snapshot);
  });

  it('overwrites an existing queue with the same name', () => {
    store.save('q', createSnapshot('q', '2026-07-20T10:00:00.000Z', ['a']));
    store.save('q', createSnapshot('q', '2026-07-20T11:00:00.000Z', ['a', 'b', 'c']));
    expect(store.load('q')?.queue.items).toHaveLength(3);
  });

  it('returns undefined for missing queues', () => {
    expect(store.load('nope')).toBeUndefined();
  });

  it('deletes corrupt snapshots and reports them missing', () => {
    const db = openCacheDatabase(dbFile);
    db.prepare(
      "INSERT INTO saved_queues (name, snapshot, saved_at) VALUES ('bad', '{oops', '2026-07-20T10:00:00.000Z')",
    ).run();
    expect(store.load('bad')).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) AS n FROM saved_queues WHERE name = 'bad'").get()).toEqual({
      n: 0,
    });
    db.close();
  });

  it('lists saved queues with item counts, most recent first', () => {
    store.save('old', createSnapshot('old', '2026-07-19T10:00:00.000Z', ['a']));
    store.save('new', createSnapshot('new', '2026-07-20T10:00:00.000Z', ['a', 'b', 'c']));

    const list = store.list();
    expect(list.map((info) => info.name)).toEqual(['new', 'old']);
    expect(list[0]?.itemCount).toBe(3);
    expect(list[1]?.itemCount).toBe(1);
  });

  it('removes queues', () => {
    store.save('q', createSnapshot('q', '2026-07-20T10:00:00.000Z', ['a']));
    store.remove('q');
    expect(store.load('q')).toBeUndefined();
    expect(store.list()).toEqual([]);
    expect(() => store.remove('q')).not.toThrowError();
  });
});
