import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openHistoryDatabase, SqliteHistoryStore } from '@/repositories';

import { createTrackFixture } from '../../helpers/fixtures';
import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('SqliteHistoryStore', () => {
  let directory: string;
  let dbFile: string;
  let store: SqliteHistoryStore;

  beforeEach(async () => {
    directory = await createTempDir();
    dbFile = join(directory, 'history.db');
    store = new SqliteHistoryStore(openHistoryDatabase(dbFile));
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  const appendTrack = (id: string, playedAt: string): void => {
    store.append({ track: createTrackFixture({ id, title: `Song ${id}` }), playedAt });
  };

  it('returns the most recent entries first', () => {
    appendTrack('a', '2026-07-20T10:00:00.000Z');
    appendTrack('b', '2026-07-20T11:00:00.000Z');
    appendTrack('c', '2026-07-20T12:00:00.000Z');

    const recent = store.recent(10);
    expect(recent.map((entry) => entry.track.id)).toEqual(['c', 'b', 'a']);
    expect(recent[0]?.playedAt).toBe('2026-07-20T12:00:00.000Z');
  });

  it('honors the limit', () => {
    appendTrack('a', '2026-07-20T10:00:00.000Z');
    appendTrack('b', '2026-07-20T11:00:00.000Z');
    expect(store.recent(1)).toHaveLength(1);
  });

  it('returns an empty list when no history exists', () => {
    expect(store.recent(5)).toEqual([]);
  });

  it('skips and deletes corrupt rows', () => {
    appendTrack('good', '2026-07-20T10:00:00.000Z');
    const db = openHistoryDatabase(dbFile);
    db.prepare("INSERT INTO history_entries (track, played_at) VALUES ('{oops', 'bad-date')").run();

    const recent = store.recent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.track.id).toBe('good');
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM history_entries WHERE played_at = 'bad-date'").get(),
    ).toEqual({ n: 0 });
    db.close();
  });

  it('clears the history', () => {
    appendTrack('a', '2026-07-20T10:00:00.000Z');
    store.clear();
    expect(store.recent(10)).toEqual([]);
  });
});
