import { describe, expect, it } from 'vitest';

import { FallbackSecretStore } from '@/auth/fallback-secret-store';
import { createSecretStore } from '@/auth/secret-store-factory';

import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('createSecretStore', () => {
  it('returns the keytar→file fallback chain', async () => {
    const directory = await createTempDir();
    try {
      const store = createSecretStore({ credentialsFile: `${directory}/credentials` });
      expect(store).toBeInstanceOf(FallbackSecretStore);
      expect(store.name).toBe('auto');
    } finally {
      await removeTempDir(directory);
    }
  });
});
