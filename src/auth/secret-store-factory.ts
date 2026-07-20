import type { Logger } from 'pino';

import { FallbackSecretStore } from '@/auth/fallback-secret-store';
import { FileSecretStore } from '@/auth/file-secret-store';
import { KeytarSecretStore } from '@/auth/keytar-secret-store';
import type { SecretStore } from '@/core/ports';

/** Options for {@link createSecretStore}. */
export interface SecretStoreOptions {
  /** Path of the fallback credentials file. */
  readonly credentialsFile: string;
  readonly logger?: Logger;
}

/**
 * Creates the credential store for this machine: OS keychain when
 * available, permission-restricted file otherwise.
 */
export function createSecretStore(options: SecretStoreOptions): SecretStore {
  return new FallbackSecretStore(
    new KeytarSecretStore(),
    new FileSecretStore(options.credentialsFile),
    options.logger,
  );
}
