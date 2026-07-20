import { homedir } from 'node:os';
import { join } from 'node:path';

import { cosmiconfig } from 'cosmiconfig';

import { ConfigError, ValidationError } from '@/core/errors';
import { AppConfigSchema, type AppConfig } from '@/models';
import { processEnvReader, type EnvReader } from '@/config/env-reader';
import { deepMerge, isPlainObject, setDotted, type PlainObject } from '@/config/merge';
import { resolveAppPathsFromEnv, type AppPaths } from '@/config/paths';
import { isErrnoException } from '@/utils/fs';

/** Inputs for {@link loadConfig}; all optional for production defaults. */
export interface LoadConfigOptions {
  readonly paths?: AppPaths;
  readonly envReader?: EnvReader;
  readonly homeDir?: string;
}

/** Result of loading the configuration. */
export interface LoadedConfig {
  readonly config: AppConfig;
  readonly paths: AppPaths;
  /** The file configuration was read from; null when defaults are used. */
  readonly configFileUsed: string | null;
}

/**
 * Loads the effective configuration with precedence
 * defaults < config.json < YTMUSIC_* environment variables.
 * Throws {@link ConfigError} on malformed files or invalid values.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const paths = options.paths ?? resolveAppPathsFromEnv();
  const envReader = options.envReader ?? processEnvReader;
  const homeDir = options.homeDir ?? homedir();

  let fileConfig: PlainObject = {};
  let configFileUsed: string | null = null;
  const explorer = cosmiconfig('ytmusic-cli');
  try {
    const result = await explorer.load(paths.configFile);
    if (result !== null && result.isEmpty !== true) {
      fileConfig = isPlainObject(result.config) ? result.config : {};
      configFileUsed = result.filepath;
    }
  } catch (error) {
    // cosmiconfig .load() throws ENOENT for a missing file: that simply
    // means "no config file yet" — fall back to defaults.
    if (!isErrnoException(error, 'ENOENT')) {
      throw new ConfigError(
        'CONFIG_INVALID',
        `Failed to parse config file ${paths.configFile}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  let envOverrides: PlainObject;
  try {
    envOverrides = collectEnvOverrides(envReader);
  } catch (error) {
    throw new ConfigError('CONFIG_INVALID', error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }

  const merged = deepMerge(fileConfig, envOverrides);
  const parsed = AppConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigError(
      'CONFIG_INVALID',
      ValidationError.fromZodError(parsed.error, 'Invalid configuration').message,
      { cause: parsed.error },
    );
  }

  return { config: resolveDownloadDirectory(parsed.data, homeDir), paths, configFileUsed };
}

/** Collects supported YTMUSIC_* variables into a nested override object. */
function collectEnvOverrides(env: EnvReader): PlainObject {
  const overrides: PlainObject = {};
  const assign = (path: string, value: unknown): void => {
    setDotted(overrides, path, value);
  };

  const backend = env.get('PLAYER_BACKEND');
  if (backend !== undefined) assign('player.backend', backend);
  const volume = env.getInteger('PLAYER_VOLUME');
  if (volume !== undefined) assign('player.volume', volume);
  const mpvPath = env.get('MPV_PATH');
  if (mpvPath !== undefined) assign('player.mpvPath', mpvPath);
  const vlcPath = env.get('VLC_PATH');
  if (vlcPath !== undefined) assign('player.vlcPath', vlcPath);
  const searchLimit = env.getInteger('SEARCH_LIMIT');
  if (searchLimit !== undefined) assign('search.limit', searchLimit);
  const logLevel = env.get('LOG_LEVEL');
  if (logLevel !== undefined) assign('logging.level', logLevel);
  const logPretty = env.getBoolean('LOG_PRETTY');
  if (logPretty !== undefined) assign('logging.pretty', logPretty);
  const downloadDir = env.get('DOWNLOAD_DIR');
  if (downloadDir !== undefined) assign('download.directory', downloadDir);
  const rateLimit = env.getInteger('RATE_LIMIT_RPS');
  if (rateLimit !== undefined) assign('rateLimit.requestsPerSecond', rateLimit);

  return overrides;
}

/** Applies the default download directory and expands a leading `~/`. */
function resolveDownloadDirectory(config: AppConfig, homeDir: string): AppConfig {
  const configured = config.download.directory;
  const directory =
    configured === undefined || configured === ''
      ? join(homeDir, 'Music', 'ytmusic')
      : configured.startsWith('~/')
        ? join(homeDir, configured.slice(2))
        : configured;
  return { ...config, download: { ...config.download, directory } };
}
