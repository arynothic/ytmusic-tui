import { describe, expect, it } from 'vitest';

import { migrateDatabase, openDatabase, type Migration } from '@/cache';
import { CacheError } from '@/core/errors';

describe('openDatabase', () => {
  it('opens an in-memory database', () => {
    const db = openDatabase(':memory:');
    db.exec('CREATE TABLE t (a INTEGER)');
    db.prepare('INSERT INTO t VALUES (?)').run(1);
    expect(db.prepare('SELECT a FROM t').get()).toEqual({ a: 1 });
    db.close();
  });

  it('throws CacheError when the file cannot be opened', () => {
    expect(() => openDatabase('/definitely-missing-dir-xyz/db.sqlite')).toThrowError(CacheError);
    expect(() => openDatabase('/definitely-missing-dir-xyz/db.sqlite')).toThrowError(
      /CACHE_OPEN_FAILED|Failed to open database/,
    );
  });
});

describe('migrateDatabase', () => {
  it('applies migrations in version order and records user_version', () => {
    const db = openDatabase(':memory:');
    const applied: string[] = [];
    const migrations: Migration[] = [
      {
        version: 2,
        name: 'second',
        up: () => {
          applied.push('second');
        },
      },
      {
        version: 1,
        name: 'first',
        up: () => {
          applied.push('first');
        },
      },
    ];
    migrateDatabase(db, migrations);
    expect(applied).toEqual(['first', 'second']);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    db.close();
  });

  it('is idempotent — already applied migrations do not re-run', () => {
    const db = openDatabase(':memory:');
    let runs = 0;
    const migration: Migration = {
      version: 1,
      name: 'once',
      up: () => {
        runs += 1;
      },
    };
    migrateDatabase(db, [migration]);
    migrateDatabase(db, [migration]);
    expect(runs).toBe(1);
    db.close();
  });

  it('wraps migration failures in CacheError and keeps the previous version', () => {
    const db = openDatabase(':memory:');
    const good: Migration = {
      version: 1,
      name: 'good',
      up: (database) => {
        database.exec('CREATE TABLE t (a INTEGER)');
      },
    };
    const bad: Migration = {
      version: 2,
      name: 'bad',
      up: () => {
        throw new Error('nope');
      },
    };
    expect(() => migrateDatabase(db, [good, bad])).toThrowError(CacheError);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    db.close();
  });
});
