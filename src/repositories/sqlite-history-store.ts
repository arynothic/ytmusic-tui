import type { Database } from 'better-sqlite3';

import type { Migration } from '@/cache/migrations';
import { CacheError } from '@/core/errors';
import type { HistoryStore } from '@/core/ports';
import { HistoryEntrySchema, type HistoryEntry } from '@/models';

interface HistoryRow {
  id: number;
  track: string;
  played_at: string;
}

/** Migration creating the history_entries table (history.db version 1). */
export const historyEntriesMigration: Migration = {
  version: 1,
  name: 'create history_entries',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS history_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track TEXT NOT NULL,
        played_at TEXT NOT NULL
      );
    `);
  },
};

/**
 * SQLite-backed {@link HistoryStore}. Corrupt rows are deleted and
 * skipped; SQL failures throw {@link CacheError}.
 */
export class SqliteHistoryStore implements HistoryStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  append(entry: HistoryEntry): void {
    try {
      this.#db
        .prepare('INSERT INTO history_entries (track, played_at) VALUES (?, ?)')
        .run(JSON.stringify(entry.track), entry.playedAt);
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to append history entry', {
        cause: error,
      });
    }
  }

  recent(limit: number): HistoryEntry[] {
    let rows: HistoryRow[];
    try {
      rows = this.#db
        .prepare('SELECT id, track, played_at FROM history_entries ORDER BY id DESC LIMIT ?')
        .all(limit) as HistoryRow[];
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to read history', { cause: error });
    }

    const entries: HistoryEntry[] = [];
    for (const row of rows) {
      const entry = parseHistoryRow(row);
      if (entry === undefined) {
        this.#deleteRow(row.id);
      } else {
        entries.push(entry);
      }
    }
    return entries;
  }

  clear(): void {
    try {
      this.#db.prepare('DELETE FROM history_entries').run();
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to clear history', { cause: error });
    }
  }

  #deleteRow(id: number): void {
    try {
      this.#db.prepare('DELETE FROM history_entries WHERE id = ?').run(id);
    } catch (error) {
      throw new CacheError('CACHE_QUERY_FAILED', 'Failed to delete corrupt history row', {
        cause: error,
      });
    }
  }
}

/** Parses a row into a HistoryEntry; undefined when corrupt. */
function parseHistoryRow(row: HistoryRow): HistoryEntry | undefined {
  try {
    const trackJson: unknown = JSON.parse(row.track);
    const parsed = HistoryEntrySchema.safeParse({ track: trackJson, playedAt: row.played_at });
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
