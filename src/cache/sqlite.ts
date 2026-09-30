import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

/**
 * A tiny synchronous SQLite adapter over Node's built-in `node:sqlite`
 * module. It exposes just the surface the repositories use, with the same
 * shape the previous `better-sqlite3` dependency provided (`exec`,
 * `prepare().run/get/all`, `pragma`, `transaction`).
 *
 * Using the built-in module instead of a native addon means the package
 * installs with **no build scripts and no native dependencies** — which
 * matters now that npm blocks dependency install scripts by default.
 */
export interface SqliteStatement {
  /** Executes the statement; returns the affected-row count. */
  run(...params: unknown[]): { changes: number };
  /** Returns the first row, or undefined. */
  get(...params: unknown[]): unknown;
  /** Returns all rows. */
  all(...params: unknown[]): unknown[];
}

/** Synchronous SQLite database handle used throughout the repositories. */
export interface Database {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  /** Reads a pragma (`simple: true` unwraps the single value) or runs an assignment. */
  pragma(source: string, options?: { simple?: boolean }): unknown;
  /** Wraps a function in BEGIN/COMMIT with ROLLBACK on failure. */
  transaction<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: typeof DatabaseSyncType;
}
let nodeSqlite: NodeSqliteModule | undefined;

/**
 * Loads `node:sqlite` lazily (via createRequire). Deferring evaluation
 * lets the CLI silence Node 22's SQLite experimental warning before the
 * module is first required.
 */
function loadNodeSqlite(): NodeSqliteModule {
  nodeSqlite ??= createRequire(import.meta.url)('node:sqlite') as NodeSqliteModule;
  return nodeSqlite;
}

/** Converts a raw SQLite row (null prototype) into a plain object. */
function toPlain<T>(row: T): T {
  return row === null || typeof row !== 'object' ? row : ({ ...(row as object) } as T);
}

/** Opens a synchronous SQLite database (use ':memory:' for an in-memory one). */
export function openSqlite(file: string): Database {
  const { DatabaseSync } = loadNodeSqlite();
  const db = new DatabaseSync(file);

  return {
    exec: (sql) => {
      db.exec(sql);
    },
    prepare: (sql) => {
      const statement = db.prepare(sql);
      return {
        run: (...params) => {
          const result = statement.run(...(params as never[]));
          return { changes: Number(result.changes) };
        },
        get: (...params) => toPlain(statement.get(...(params as never[]))),
        all: (...params) =>
          (statement.all(...(params as never[])) as unknown[]).map((row) => toPlain(row)),
      };
    },
    pragma: (source, options) => {
      if (source.includes('=')) {
        db.exec(`PRAGMA ${source}`);
        return options?.simple === true ? undefined : [];
      }
      const rows = db.prepare(`PRAGMA ${source}`).all() as Record<string, unknown>[];
      if (options?.simple === true) {
        const first = rows[0];
        return first === undefined ? undefined : Object.values(first)[0];
      }
      return rows.map((row) => toPlain(row));
    },
    transaction: (fn) => {
      return (...args) => {
        db.exec('BEGIN');
        try {
          const result = fn(...args);
          db.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // A rollback failure must not mask the original error.
          }
          throw error;
        }
      };
    },
    close: () => {
      db.close();
    },
  };
}
