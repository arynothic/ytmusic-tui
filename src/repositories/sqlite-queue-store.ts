import type { Database } from 'better-sqlite3';

import type { Migration } from '@/cache/migrations';
import { CacheError } from '@/core/errors';
import type { QueueStore } from '@/core/ports';
import {
  QueueSnapshotSchema,
  SavedQueueInfoSchema,
  type QueueSnapshot,
  type SavedQueueInfo,
} from '@/models';

interface QueueRow {
  snapshot: string;
}

interface QueueInfoRow {
  name: string;
  saved_at: string;
  item_count: number;
}

/** Migration creating the saved_queues table (cache.db version 2). */
export const savedQueuesMigration: Migration = {
  version: 2,
  name: 'create saved_queues',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_queues (
        name TEXT PRIMARY KEY,
        snapshot TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );
    `);
  },
};

/**
 * SQLite-backed {@link QueueStore}. Corrupt snapshots are deleted and
 * reported as missing; SQL failures throw {@link CacheError}.
 */
export class SqliteQueueStore implements QueueStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  save(name: string, snapshot: QueueSnapshot): void {
    this.#run(
      'INSERT OR REPLACE INTO saved_queues (name, snapshot, saved_at) VALUES (?, ?, ?)',
      name,
      JSON.stringify(snapshot),
      snapshot.savedAt,
    );
  }

  load(name: string): QueueSnapshot | undefined {
    let row: QueueRow | undefined;
    try {
      row = this.#db.prepare('SELECT snapshot FROM saved_queues WHERE name = ?').get(name) as
        QueueRow | undefined;
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', `Failed to load queue "${name}"`, {
        cause: error,
      });
    }
    if (row === undefined) {
      return undefined;
    }
    const snapshot = parseSnapshot(row.snapshot);
    if (snapshot === undefined) {
      this.remove(name);
    }
    return snapshot;
  }

  list(): SavedQueueInfo[] {
    let rows: QueueInfoRow[];
    try {
      rows = this.#db
        .prepare(
          `SELECT name, saved_at, json_array_length(json_extract(snapshot, '$.queue.items')) AS item_count
           FROM saved_queues ORDER BY saved_at DESC`,
        )
        .all() as QueueInfoRow[];
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to list saved queues', { cause: error });
    }
    const infos: SavedQueueInfo[] = [];
    for (const row of rows) {
      const parsed = SavedQueueInfoSchema.safeParse({
        name: row.name,
        savedAt: row.saved_at,
        itemCount: row.item_count,
      });
      if (parsed.success) {
        infos.push(parsed.data);
      }
    }
    return infos;
  }

  remove(name: string): void {
    this.#run('DELETE FROM saved_queues WHERE name = ?', name);
  }

  #run(sql: string, ...params: unknown[]): void {
    try {
      this.#db.prepare(sql).run(...params);
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to write queue store', { cause: error });
    }
  }
}

/** Parses a stored snapshot; undefined when corrupt. */
function parseSnapshot(raw: string): QueueSnapshot | undefined {
  try {
    const parsed = QueueSnapshotSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
