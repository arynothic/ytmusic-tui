import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureConfigDirectory, resolveAppPaths, resolveAppPathsFromEnv } from '@/config';

import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('resolveAppPaths', () => {
  it('honors an explicit config home override above all', () => {
    const paths = resolveAppPaths({
      configHomeOverride: '/tmp/custom',
      xdgConfigHome: '/tmp/xdg',
      homeDir: '/tmp/home',
    });
    expect(paths.configDir).toBe('/tmp/custom');
    expect(paths.configFile).toBe(join('/tmp/custom', 'config.json'));
    expect(paths.cacheDbFile).toBe(join('/tmp/custom', 'cache.db'));
    expect(paths.historyDbFile).toBe(join('/tmp/custom', 'history.db'));
    expect(paths.credentialsFile).toBe(join('/tmp/custom', 'credentials'));
    expect(paths.logFile).toBe(join('/tmp/custom', 'ytmusic-cli.log'));
  });

  it('uses XDG_CONFIG_HOME when set', () => {
    const paths = resolveAppPaths({ xdgConfigHome: '/tmp/xdg', homeDir: '/tmp/home' });
    expect(paths.configDir).toBe(join('/tmp/xdg', 'ytmusic-cli'));
  });

  it('falls back to ~/.config/ytmusic-cli', () => {
    const paths = resolveAppPaths({ homeDir: '/tmp/home' });
    expect(paths.configDir).toBe(join('/tmp/home', '.config', 'ytmusic-cli'));
  });

  it('treats empty XDG_CONFIG_HOME as unset', () => {
    const paths = resolveAppPaths({ xdgConfigHome: '', homeDir: '/tmp/home' });
    expect(paths.configDir).toBe(join('/tmp/home', '.config', 'ytmusic-cli'));
  });
});

describe('resolveAppPathsFromEnv', () => {
  it('prefers YTMUSIC_CONFIG_HOME over XDG_CONFIG_HOME', () => {
    vi.stubEnv('YTMUSIC_CONFIG_HOME', '/tmp/ytmusic-override');
    vi.stubEnv('XDG_CONFIG_HOME', '/tmp/xdg');
    expect(resolveAppPathsFromEnv().configDir).toBe('/tmp/ytmusic-override');
  });
});

describe('ensureConfigDirectory', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('creates the directory recursively and idempotently', async () => {
    const paths = resolveAppPaths({ configHomeOverride: join(directory, 'nested', 'cfg') });
    await ensureConfigDirectory(paths);
    await ensureConfigDirectory(paths);
    const stats = await stat(paths.configDir);
    expect(stats.isDirectory()).toBe(true);
  });
});
