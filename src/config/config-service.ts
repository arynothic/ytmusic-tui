import { writeFile } from 'node:fs/promises';

import { ConfigError } from '@/core/errors';
import { AppConfigSchema, type AppConfig } from '@/models';
import { flattenConfig } from '@/config/flatten';
import { isPlainObject, setDotted, type PlainObject } from '@/config/merge';
import { ensureConfigDirectory, type AppPaths } from '@/config/paths';

/**
 * Holds the effective configuration and persists user changes to
 * config.json. All mutations are validated against AppConfigSchema
 * before being written.
 */
export class ConfigService {
  readonly paths: AppPaths;
  #config: AppConfig;

  constructor(paths: AppPaths, config: AppConfig) {
    this.paths = paths;
    this.#config = config;
  }

  /** The effective configuration. */
  get config(): AppConfig {
    return this.#config;
  }

  /** Flattened dotted key → value pairs for display. */
  list(): Record<string, string> {
    return flattenConfig(this.#config);
  }

  /**
   * Reads a leaf value by dotted key.
   * Throws {@link ConfigError} for unknown keys or sections.
   */
  get(key: string): unknown {
    return readLeaf(this.#config, key);
  }

  /**
   * Sets a dotted key to a coerced scalar value ("75" → 75, "true" → true),
   * validates the whole config, and persists it atomically-ish.
   * Throws {@link ConfigError} for unknown keys or invalid values.
   */
  async set(key: string, rawValue: string): Promise<AppConfig> {
    readLeaf(this.#config, key);
    const draft = structuredClone(this.#config) as PlainObject;
    setDotted(draft, key, coerceScalar(rawValue));
    const parsed = AppConfigSchema.safeParse(draft);
    if (!parsed.success) {
      throw new ConfigError(
        'CONFIG_INVALID',
        `Invalid value for "${key}": ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
        { cause: parsed.error },
      );
    }
    await this.persist(parsed.data);
    this.#config = parsed.data;
    return parsed.data;
  }

  /** Writes the given configuration to config.json. */
  async persist(config: AppConfig): Promise<void> {
    try {
      await ensureConfigDirectory(this.paths);
      await writeFile(this.paths.configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    } catch (error) {
      throw new ConfigError('CONFIG_WRITE_FAILED', `Failed to write ${this.paths.configFile}`, {
        cause: error,
      });
    }
  }
}

/** Parses JSON scalars; falls back to the raw string. */
function coerceScalar(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** Walks a dotted path, requiring every segment to exist and the target to be a leaf. */
function readLeaf(config: AppConfig, key: string): unknown {
  let current: unknown = config;
  for (const segment of key.split('.')) {
    if (!isPlainObject(current) || !Object.hasOwn(current, segment)) {
      throw new ConfigError('CONFIG_INVALID', `Unknown configuration key "${key}"`);
    }
    current = current[segment];
  }
  if (isPlainObject(current)) {
    throw new ConfigError('CONFIG_INVALID', `"${key}" is a section; specify a leaf key`);
  }
  return current;
}
