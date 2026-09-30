import { describe, expect, it } from 'vitest';

import { FileSecretStore } from '@/auth/file-secret-store';
import { createSecretStore } from '@/auth/secret-store-factory';

import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('createSecretStore', () => {
  it('returns a file-backed store at the given path', async () => {
    const directory = await createTempDir();
    try {
      const store = createSecretStore({ credentialsFile: `${directory}/credentials` });
      expect(store).toBeInstanceOf(FileSecretStore);
      expect(store.name).toBe('file');
      expect((store as FileSecretStore).filePath).toBe(`${directory}/credentials`);
    } finally {
      await removeTempDir(directory);
    }
  });
});
