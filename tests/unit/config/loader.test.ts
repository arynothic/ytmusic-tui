import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig, resolveAppPaths } from '@/config';
import { ConfigError } from '@/core/errors';

import { nullEnvReader } from '../../helpers/test-context';
import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('loadConfig', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  const pathsFor = (dir: string): ReturnType<typeof resolveAppPaths> =>
    resolveAppPaths({ configHomeOverride: dir });

  it('returns defaults when no config file exists', async () => {
    const { config, configFileUsed } = await loadConfig({
      paths: pathsFor(directory),
      envReader: nullEnvReader,
      homeDir: directory,
    });
    expect(config.player.backend).toBe('auto');
    expect(config.player.volume).toBe(80);
    expect(configFileUsed).toBeNull();
  });

  it('resolves the default download directory under the home directory', async () => {
    const { config } = await loadConfig({
      paths: pathsFor(directory),
      envReader: nullEnvReader,
      homeDir: '/home/tester',
    });
    expect(config.download.directory).toBe(join('/home/tester', 'Music', 'ytmusic'));
  });

  it('merges a partial config file with defaults', async () => {
    await writeFile(
      join(directory, 'config.json'),
      JSON.stringify({ player: { volume: 25 }, search: { limit: 10 } }),
    );
    const { config, configFileUsed } = await loadConfig({
      paths: pathsFor(directory),
      envReader: nullEnvReader,
      homeDir: directory,
    });
    expect(config.player.volume).toBe(25);
    expect(config.player.backend).toBe('auto');
    expect(config.search.limit).toBe(10);
    expect(configFileUsed).toBe(join(directory, 'config.json'));
  });

  it('expands a leading ~/ in the download directory', async () => {
    await writeFile(join(directory, 'config.json'), JSON.stringify({ download: { directory: '~/Tunes' } }));
    const { config } = await loadConfig({
      paths: pathsFor(directory),
      envReader: nullEnvReader,
      homeDir: '/home/tester',
    });
    expect(config.download.directory).toBe(join('/home/tester', 'Tunes'));
  });

  it('lets environment variables beat the config file', async () => {
    await writeFile(join(directory, 'config.json'), JSON.stringify({ player: { volume: 25 } }));
    vi.stubEnv('YTMUSIC_PLAYER_VOLUME', '55');
    vi.stubEnv('YTMUSIC_LOG_LEVEL', 'debug');
    const { config } = await loadConfig({ paths: pathsFor(directory), homeDir: directory });
    expect(config.player.volume).toBe(55);
    expect(config.logging.level).toBe('debug');
  });

  it('throws ConfigError for a malformed config file', async () => {
    await writeFile(join(directory, 'config.json'), '{ not json');
    await expect(
      loadConfig({ paths: pathsFor(directory), envReader: nullEnvReader }),
    ).rejects.toThrowError(ConfigError);
  });

  it('throws ConfigError for schema-invalid config files', async () => {
    await writeFile(join(directory, 'config.json'), JSON.stringify({ player: { volume: 500 } }));
    await expect(
      loadConfig({ paths: pathsFor(directory), envReader: nullEnvReader }),
    ).rejects.toThrowError(/volume/);
  });

  it('throws ConfigError for invalid environment values', async () => {
    vi.stubEnv('YTMUSIC_PLAYER_VOLUME', 'loud');
    await expect(loadConfig({ paths: pathsFor(directory) })).rejects.toThrowError(ConfigError);
  });

  it('throws ConfigError for env values that fail schema validation', async () => {
    vi.stubEnv('YTMUSIC_PLAYER_BACKEND', 'spotify');
    await expect(loadConfig({ paths: pathsFor(directory) })).rejects.toThrowError(/backend/);
  });
});
