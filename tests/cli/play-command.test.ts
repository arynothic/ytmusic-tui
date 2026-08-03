import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerPlayCommand } from '@/commands/play';
import { Tokens } from '@/core/tokens';

import { createTrackFixture } from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('play command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      tracks: [
        createTrackFixture({ id: 'v1', title: 'Fix You' }),
        createTrackFixture({ id: 'v2', title: 'Fix You (Live)' }),
      ],
    });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('plays the first match and seeds the queue with the rest', async () => {
    const output = await runCli(registerPlayCommand, service.context, ['play', 'Fix You']);

    expect(output).toContain('Now playing: Fix You');
    expect(service.player.calls[0]?.method).toBe('play');

    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().items.map((item) => item.track.id)).toEqual(['v1', 'v2']);
    // Live queue persisted for later invocations.
    expect(service.queueStore.data.has('_current')).toBe(true);
    // History recorded.
    expect(service.historyStore.entries.map((entry) => entry.track.id)).toEqual(['v1']);
  });

  it('warns when nothing matches', async () => {
    const output = await runCli(registerPlayCommand, service.context, ['play', 'zzzz']);
    expect(output).toContain('No tracks found');
    expect(service.player.calls).toHaveLength(0);
  });

  it('enables shuffle with --shuffle', async () => {
    await runCli(registerPlayCommand, service.context, ['play', 'Fix You', '--shuffle']);
    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().shuffle).toBe(true);
  });
});
