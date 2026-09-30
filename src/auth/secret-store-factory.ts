import { FileSecretStore } from '@/auth/file-secret-store';
import type { SecretStore } from '@/core/ports';

/** Options for {@link createSecretStore}. */
export interface SecretStoreOptions {
  /** Path of the credentials file. */
  readonly credentialsFile: string;
}

/**
 * Creates the credential store: a permission-restricted file (0600)
 * inside the config directory, written atomically.
 *
 * The previous OS-keychain backend (keytar) was removed: it is deprecated
 * and, as a native addon, forced npm users to approve install scripts
 * before the CLI would work. Filesystem permissions are the same model
 * the GitHub CLI uses for tokens.
 */
export function createSecretStore(options: SecretStoreOptions): SecretStore {
  return new FileSecretStore(options.credentialsFile);
}
