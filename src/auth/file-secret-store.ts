import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { z } from 'zod';

import { AuthError } from '@/core/errors';
import type { SecretStore } from '@/core/ports';
import { isErrnoException } from '@/utils/fs';

const SecretsFileSchema = z.object({
  version: z.literal(1),
  secrets: z.record(z.string(), z.string()),
});
type SecretsFile = z.infer<typeof SecretsFileSchema>;

const EMPTY_FILE: SecretsFile = { version: 1, secrets: {} };

/**
 * File-backed {@link SecretStore} fallback for systems without an OS
 * keychain (notably headless Linux). Secrets are stored as JSON with
 * 0600 permissions inside the 0700 config directory; writes are atomic
 * (temp file + rename). Protection relies on filesystem permissions —
 * the same model the GitHub CLI uses for tokens.
 */
export class FileSecretStore implements SecretStore {
  readonly name = 'file';
  readonly filePath: string;
  /** Serializes all operations: read-modify-write must never interleave. */
  #queue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  get(key: string): Promise<string | undefined> {
    return this.#enqueue(async () => {
      const file = await this.#read();
      return file.secrets[key];
    });
  }

  set(key: string, value: string): Promise<void> {
    return this.#enqueue(async () => {
      const file = await this.#read();
      await this.#write({ ...file, secrets: { ...file.secrets, [key]: value } });
    });
  }

  delete(key: string): Promise<void> {
    return this.#enqueue(async () => {
      const file = await this.#read();
      if (!(key in file.secrets)) {
        return;
      }
      const secrets = { ...file.secrets };
      delete secrets[key];
      await this.#write({ ...file, secrets });
    });
  }

  /** Runs an operation after all previously queued operations settle. */
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(operation, operation);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #read(): Promise<SecretsFile> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const json: unknown = JSON.parse(raw);
      return SecretsFileSchema.parse(json);
    } catch (error) {
      if (isErrnoException(error, 'ENOENT')) {
        return { ...EMPTY_FILE, secrets: {} };
      }
      throw new AuthError(
        'AUTH_STORE_UNAVAILABLE',
        `Credentials file ${this.filePath} is unreadable; delete it and log in again`,
        { cause: error },
      );
    }
  }

  async #write(file: SecretsFile): Promise<void> {
    const tmpFile = `${this.filePath}.${String(process.pid)}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeFile(tmpFile, JSON.stringify(file), { encoding: 'utf8', mode: 0o600 });
      await rename(tmpFile, this.filePath);
    } catch (error) {
      throw new AuthError(
        'AUTH_STORE_UNAVAILABLE',
        `Failed to write credentials file ${this.filePath}`,
        { cause: error },
      );
    }
  }
}
