import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerCacheCommand } from '@/commands/cache';
import { createTrackFixture } from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('cache command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory);
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('clears the cache', async () => {
    service.cacheStore.set('search:all:x:20', { fake: true }, 60_000);
    expect(service.cacheStore.data.size).toBe(1);

    const output = await runCli(registerCacheCommand, service.context, ['cache', 'clear']);
    expect(output).toContain('Cache cleared');
    expect(service.cacheStore.data.size).toBe(0);
  });

  it('--history also clears the local playback history', async () => {
    service.historyStore.append({
      track: createTrackFixture(),
      playedAt: new Date().toISOString(),
    });

    const output = await runCli(registerCacheCommand, service.context, [
      'cache',
      'clear',
      '--history',
    ]);
    expect(output).toContain('Cache and history cleared');
    expect(service.historyStore.entries).toHaveLength(0);
  });
});
