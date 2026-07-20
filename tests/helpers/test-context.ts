import { vi } from 'vitest';

import type { AppContext } from '@/cli/context';
import { ConfigService, loadConfig, resolveAppPaths, type EnvReader } from '@/config';
import { Container } from '@/core/container';
import { createLogger } from '@/utils/logger';

/** EnvReader that sees nothing — keeps host env out of tests. */
export const nullEnvReader: EnvReader = {
  get: () => undefined,
  getBoolean: () => undefined,
  getInteger: () => undefined,
};

/** Builds a real AppContext rooted at a temporary config directory. */
export async function createTestContext(configDir: string): Promise<AppContext> {
  const paths = resolveAppPaths({ configHomeOverride: configDir });
  const { config } = await loadConfig({ paths, homeDir: configDir, envReader: nullEnvReader });
  const configService = new ConfigService(paths, config);
  return {
    container: new Container(),
    paths,
    config,
    configService,
    logger: createLogger({ level: 'silent' }),
  };
}

/** Captures process.stdout writes until `restore()` is called. */
export function captureStdout(): { text: () => string; restore: () => void } {
  let output = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
    output += String(chunk);
    return true;
  });
  return {
    text: () => output,
    restore: () => {
      spy.mockRestore();
    },
  };
}

/** Captures process.stderr writes until `restore()` is called. */
export function captureStderr(): { text: () => string; restore: () => void } {
  let output = '';
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
    output += String(chunk);
    return true;
  });
  return {
    text: () => output,
    restore: () => {
      spy.mockRestore();
    },
  };
}
