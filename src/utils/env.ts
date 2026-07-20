/** Prefix applied to every environment variable read by ytmusic-cli. */
export const ENV_PREFIX = 'YTMUSIC_';

/** Reads a raw environment variable with the {@link ENV_PREFIX} applied. */
export function getEnv(name: string): string | undefined {
  const value = process.env[`${ENV_PREFIX}${name}`];
  return value === undefined || value === '' ? undefined : value;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

/**
 * Reads a boolean environment variable. Returns `undefined` when unset.
 * Throws a plain `Error` on unrecognized values; callers at the config
 * boundary are expected to wrap it in a `ConfigError`.
 */
export function getEnvBoolean(name: string): boolean | undefined {
  const raw = getEnv(name);
  if (raw === undefined) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  throw new Error(`Environment variable ${ENV_PREFIX}${name} must be a boolean, got "${raw}"`);
}

/**
 * Reads an integer environment variable. Returns `undefined` when unset.
 * Throws a plain `Error` on non-integer values; callers at the config
 * boundary are expected to wrap it in a `ConfigError`.
 */
export function getEnvInteger(name: string): number | undefined {
  const raw = getEnv(name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${ENV_PREFIX}${name} must be an integer, got "${raw}"`);
  }
  return value;
}
