// keytar is a CommonJS native module; Node's ESM-CJS interop cannot
// detect its named exports, so a default import + destructure is required
// (named imports work in vitest/tsx but fail in the bundled dist).
import keytar from 'keytar';

import { AuthError } from '@/core/errors';
import type { SecretStore } from '@/core/ports';

const { deletePassword, getPassword, setPassword } = keytar;

const SERVICE_NAME = 'ytmusic-cli';

/**
 * OS keychain-backed {@link SecretStore} via keytar (macOS Keychain,
 * Windows Credential Vault, Linux Secret Service/libsecret).
 * Availability is probed once and memoized: on headless Linux without a
 * Secret Service daemon, keytar operations fail and callers are expected
 * to fall back to another store.
 */
export class KeytarSecretStore implements SecretStore {
  readonly name = 'keytar';
  #available: boolean | undefined;

  /** Probes the keychain with a throwaway round-trip; memoized. */
  async isAvailable(): Promise<boolean> {
    this.#available ??= await this.#probe();
    return this.#available;
  }

  async get(key: string): Promise<string | undefined> {
    try {
      return (await getPassword(SERVICE_NAME, key)) ?? undefined;
    } catch (error) {
      throw new AuthError('AUTH_STORE_UNAVAILABLE', 'The OS keychain is not available', {
        cause: error,
      });
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      await setPassword(SERVICE_NAME, key, value);
    } catch (error) {
      throw new AuthError('AUTH_STORE_UNAVAILABLE', 'The OS keychain is not available', {
        cause: error,
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await deletePassword(SERVICE_NAME, key);
    } catch (error) {
      throw new AuthError('AUTH_STORE_UNAVAILABLE', 'The OS keychain is not available', {
        cause: error,
      });
    }
  }

  async #probe(): Promise<boolean> {
    const probeAccount = `probe-${String(process.pid)}`;
    try {
      await setPassword(SERVICE_NAME, probeAccount, 'probe');
      await getPassword(SERVICE_NAME, probeAccount);
      await deletePassword(SERVICE_NAME, probeAccount);
      return true;
    } catch {
      return false;
    }
  }
}
