import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { getEnv } from '@/utils/env';

/** Every file and directory location used by ytmusic-cli. */
export interface AppPaths {
  readonly configDir: string;
  readonly configFile: string;
  readonly cacheDbFile: string;
  readonly historyDbFile: string;
  readonly credentialsFile: string;
  readonly logFile: string;
}

/** Explicit inputs for {@link resolveAppPaths}; defaults read env and OS. */
export interface ResolvePathsOptions {
  readonly configHomeOverride?: string;
  readonly xdgConfigHome?: string;
  readonly homeDir?: string;
}

/**
 * Resolves all application paths. Precedence: explicit override >
 * XDG config home > ~/.config/ytmusic-cli.
 */
export function resolveAppPaths(options: ResolvePathsOptions = {}): AppPaths {
  const homeDir = options.homeDir ?? homedir();
  const xdg = options.xdgConfigHome;
  const configDir =
    options.configHomeOverride ??
    (xdg !== undefined && xdg !== ''
      ? join(xdg, 'ytmusic-cli')
      : join(homeDir, '.config', 'ytmusic-cli'));
  return {
    configDir,
    configFile: join(configDir, 'config.json'),
    cacheDbFile: join(configDir, 'cache.db'),
    historyDbFile: join(configDir, 'history.db'),
    credentialsFile: join(configDir, 'credentials'),
    logFile: join(configDir, 'ytmusic-cli.log'),
  };
}

/**
 * Resolves paths from the process environment:
 * `YTMUSIC_CONFIG_HOME` > `XDG_CONFIG_HOME` > `~/.config`.
 */
export function resolveAppPathsFromEnv(): AppPaths {
  return resolveAppPaths({
    configHomeOverride: getEnv('CONFIG_HOME'),
    xdgConfigHome: process.env['XDG_CONFIG_HOME'],
  });
}

/** Creates the config directory with user-only permissions. Idempotent. */
export async function ensureConfigDirectory(paths: AppPaths): Promise<void> {
  await mkdir(paths.configDir, { recursive: true, mode: 0o700 });
}
