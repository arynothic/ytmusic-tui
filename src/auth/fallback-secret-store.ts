import type { Logger } from 'pino';

import type { SecretStore } from '@/core/ports';

/**
 * Composite {@link SecretStore}: uses the primary (OS keychain) when it
 * probes as available, otherwise degrades transparently to the fallback
 * (file store). The probe runs once and is memoized.
 */
export class FallbackSecretStore implements SecretStore {
  readonly name = 'auto';
  readonly primary: SecretStore;
  readonly fallback: SecretStore;
  readonly #logger: Logger | undefined;
  #primaryUsable: boolean | undefined;

  constructor(primary: SecretStore, fallback: SecretStore, logger?: Logger) {
    this.primary = primary;
    this.fallback = fallback;
    this.#logger = logger;
  }

  /** Always true: the file fallback is usable on any system. */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.#active()).get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await (await this.#active()).set(key, value);
  }

  async delete(key: string): Promise<void> {
    await (await this.#active()).delete(key);
  }

  /** Name of the store actually serving requests (after probing). */
  async activeStoreName(): Promise<string> {
    return (await this.#active()).name;
  }

  async #active(): Promise<SecretStore> {
    if (this.#primaryUsable === undefined) {
      this.#primaryUsable = await this.primary.isAvailable();
      if (!this.#primaryUsable) {
        this.#logger?.warn(
          { fallbackStore: this.fallback.name },
          'OS keychain unavailable; credentials will be stored in a file with 0600 permissions',
        );
      }
    }
    return this.#primaryUsable ? this.primary : this.fallback;
  }
}
