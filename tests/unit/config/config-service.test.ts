import { readFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigService, loadConfig, resolveAppPaths } from '@/config';
import { ConfigError } from '@/core/errors';

import { nullEnvReader } from '../../helpers/test-context';
import { createTempDir, removeTempDir } from '../../helpers/temp-dir';

describe('ConfigService', () => {
  let directory: string;
  let service: ConfigService;

  beforeEach(async () => {
    directory = await createTempDir();
    const paths = resolveAppPaths({ configHomeOverride: directory });
    const { config } = await loadConfig({ paths, homeDir: directory, envReader: nullEnvReader });
    service = new ConfigService(paths, config);
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('lists the flattened effective config', () => {
    const listed = service.list();
    expect(listed['player.backend']).toBe('auto');
    expect(listed['player.volume']).toBe('80');
    expect(listed['search.limit']).toBe('20');
  });

  it('gets leaf values by dotted key', () => {
    expect(service.get('player.volume')).toBe(80);
    expect(service.get('logging.level')).toBe('info');
  });

  it('rejects unknown keys and sections', () => {
    expect(() => service.get('player.nonexistent')).toThrowError(ConfigError);
    expect(() => service.get('player')).toThrowError(/section/);
    expect(() => service.get('__proto__.polluted')).toThrowError(ConfigError);
  });

  it('sets values with scalar coercion and persists them', async () => {
    await service.set('player.volume', '35');
    await service.set('logging.pretty', 'true');
    await service.set('player.backend', 'mpv');

    expect(service.get('player.volume')).toBe(35);
    expect(service.get('logging.pretty')).toBe(true);
    expect(service.get('player.backend')).toBe('mpv');

    const onDisk = JSON.parse(await readFile(service.paths.configFile, 'utf8')) as {
      player: { volume: number; backend: string };
    };
    expect(onDisk.player.volume).toBe(35);
    expect(onDisk.player.backend).toBe('mpv');
  });

  it('rejects invalid values without persisting', async () => {
    await expect(service.set('player.volume', 'loud')).rejects.toThrowError(/Invalid value/);
    await expect(service.set('player.backend', 'spotify')).rejects.toThrowError(/Invalid value/);
    expect(service.get('player.volume')).toBe(80);
  });

  it('rejects setting unknown keys', async () => {
    await expect(service.set('nope.key', '1')).rejects.toThrowError(/Unknown configuration key/);
  });
});
