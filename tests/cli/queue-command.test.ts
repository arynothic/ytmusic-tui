import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerPlayCommand } from '@/commands/play';
import { registerQueueCommand } from '@/commands/queue';
import { ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';

import { createTrackFixture } from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('queue command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      tracks: [
        createTrackFixture({ id: 'v1', title: 'Alpha' }),
        createTrackFixture({ id: 'v2', title: 'Beta' }),
        createTrackFixture({ id: 'v3', title: 'Gamma' }),
      ],
    });
    await runCli(registerPlayCommand, service.context, ['play', 'a']);
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  function queue(argv: string[]): Promise<string> {
    return runCli(registerQueueCommand, service.context, argv);
  }

  it('prints the queue with the current marker', async () => {
    const output = await queue(['queue']);
    expect(output).toContain('Alpha');
    expect(output).toContain('Beta');
    expect(output).toContain('Gamma');
    expect(output).toContain('▶');
    expect(output).toContain('shuffle off');
    expect(output).toContain('repeat off');
  });

  it('adds a track to the queue', async () => {
    const output = await queue(['queue', 'add', 'Beta']);
    expect(output).toContain('Queued: Beta');
    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().items).toHaveLength(4);
  });

  it('removes an item by position', async () => {
    const output = await queue(['queue', 'remove', '2']);
    expect(output).toContain('Removed: Beta');
    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().items.map((item) => item.track.title)).toEqual([
      'Alpha',
      'Gamma',
    ]);
  });

  it('rejects invalid positions', async () => {
    await expect(queue(['queue', 'remove', '99'])).rejects.toThrow(ValidationError);
    await expect(queue(['queue', 'move', '1', '99'])).rejects.toThrow(ValidationError);
  });

  it('moves an item', async () => {
    const output = await queue(['queue', 'move', '3', '1']);
    expect(output).toContain('Moved "Gamma" to position 1');
    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().items.map((item) => item.track.title)).toEqual([
      'Gamma',
      'Alpha',
      'Beta',
    ]);
  });

  it('clears the queue', async () => {
    expect(await queue(['queue', 'clear'])).toContain('Queue cleared');
    expect(await queue(['queue'])).toContain('queue is empty');
  });

  it('toggles shuffle and cycles repeat', async () => {
    expect(await queue(['queue', 'shuffle'])).toContain('Shuffle on');
    expect(await queue(['queue', 'shuffle', 'off'])).toContain('Shuffle off');
    await expect(queue(['queue', 'shuffle', 'maybe'])).rejects.toThrow(ValidationError);

    expect(await queue(['queue', 'repeat'])).toContain('Repeat: all');
    expect(await queue(['queue', 'repeat'])).toContain('Repeat: one');
    expect(await queue(['queue', 'repeat', 'off'])).toContain('Repeat: off');
    await expect(queue(['queue', 'repeat', 'yes'])).rejects.toThrow(ValidationError);
  });

  it('plays a queue position', async () => {
    const output = await queue(['queue', 'play', '2']);
    expect(output).toContain('Now playing: Beta');
    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().currentIndex).toBe(1);
  });

  it('saves, lists, restores and deletes named queues', async () => {
    expect(await queue(['queue', 'save', 'roadtrip'])).toContain('saved as "roadtrip"');
    expect(await queue(['queue', 'saved'])).toContain('roadtrip');

    await queue(['queue', 'clear']);
    expect(await queue(['queue', 'restore', 'roadtrip'])).toContain('Restored queue "roadtrip"');
    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().items).toHaveLength(3);

    expect(await queue(['queue', 'delete', 'roadtrip'])).toContain('Deleted');
    expect(await queue(['queue', 'saved'])).toContain('No saved queues');
  });
});
