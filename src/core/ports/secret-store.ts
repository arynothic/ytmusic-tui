/**
 * Port for storing secrets (credentials) securely — OS keychain when
 * available, encrypted file otherwise.
 */
export interface SecretStore {
  /** Human-readable backend name, e.g. "file". */
  readonly name: string;

  /** True when the backend is usable on this machine. */
  isAvailable(): Promise<boolean>;

  /** Returns the stored secret, or undefined when absent. */
  get(key: string): Promise<string | undefined>;

  /** Stores a secret, overwriting any previous value. */
  set(key: string, value: string): Promise<void>;

  /** Removes a secret; missing keys are not an error. */
  delete(key: string): Promise<void>;
}
