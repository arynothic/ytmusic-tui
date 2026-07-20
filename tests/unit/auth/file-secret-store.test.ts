import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileSecretStore } from '@/auth';
import { AuthError } from '@/core/errors';

import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('FileSecretStore', () => {
  let directory: string;
  let store: FileSecretStore;

  beforeEach(async () => {
    directory = await createTempDir();
    store = new FileSecretStore(join(directory, 'credentials'));
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('is always available', async () => {
    await expect(store.isAvailable()).resolves.toBe(true);
  });

  it('round-trips secrets', async () => {
    await store.set('key', 's3cret');
    await expect(store.get('key')).resolves.toBe('s3cret');
  });

  it('returns undefined for missing keys', async () => {
    await expect(store.get('missing')).resolves.toBeUndefined();
  });

  it('creates the file with 0600 permissions', async () => {
    await store.set('key', 'value');
    const stats = await stat(join(directory, 'credentials'));
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('persists multiple secrets independently', async () => {
    await store.set('a', '1');
    await store.set('b', '2');
    await store.set('a', '3');
    await expect(store.get('a')).resolves.toBe('3');
    await expect(store.get('b')).resolves.toBe('2');
  });

  it('deletes secrets, ignoring missing keys', async () => {
    await store.set('a', '1');
    await store.delete('a');
    await expect(store.get('a')).resolves.toBeUndefined();
    await expect(store.delete('a')).resolves.toBeUndefined();
  });

  it('throws AuthError for a corrupted file', async () => {
    await writeFile(join(directory, 'credentials'), '{ not json');
    await expect(store.get('key')).rejects.toThrowError(AuthError);
    await expect(store.get('key')).rejects.toThrowError(/unreadable/);
  });

  it('survives concurrent-style writes (atomic rename)', async () => {
    await Promise.all([store.set('x', '1'), store.set('y', '2')]);
    const raw = JSON.parse(await readFile(join(directory, 'credentials'), 'utf8')) as {
      secrets: Record<string, string>;
    };
    expect(Object.keys(raw.secrets).sort()).toEqual(['x', 'y']);
  });
});
