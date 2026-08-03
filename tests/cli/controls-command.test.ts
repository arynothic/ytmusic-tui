import { readFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerControlCommands } from '@/commands/controls';
import { registerPlayCommand } from '@/commands/play';
import { ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';

import { createTrackFixture } from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('playback control commands', () => {
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
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  async function play(argv: string[]): Promise<string> {
    return runCli(registerPlayCommand, service.context, argv);
  }

  function controls(argv: string[]): Promise<string> {
    return runCli(registerControlCommands, service.context, argv);
  }

  it('pauses, resumes and stops via the player backend', async () => {
    await play(['play', 'Alpha']);

    expect(await controls(['pause'])).toContain('Paused');
    expect(await controls(['resume'])).toContain('Resumed');
    expect(await controls(['stop'])).toContain('Stopped');
    expect(service.player.calls.map((call) => call.method)).toEqual([
      'play',
      'pause',
      'resume',
      'stop',
    ]);
  });

  it('advances and steps back through the persisted queue', async () => {
    await play(['play', 'a']); // matches Alpha, Beta, Gamma

    expect(await controls(['next'])).toContain('Now playing: Beta');
    expect(await controls(['next'])).toContain('Now playing: Gamma');
    expect(await controls(['next'])).toContain('End of the queue');
    expect(await controls(['previous'])).toContain('Now playing: Beta');

    const queueService = service.context.container.resolve(Tokens.QueueService);
    expect(queueService.getQueue().currentIndex).toBe(1);
  });

  it('sets the volume and persists it to the config', async () => {
    await play(['play', 'Alpha']);

    const output = await controls(['volume', '45']);
    expect(output).toContain('Volume: 45');
    expect((await service.player.getSnapshot()).volume).toBe(45);

    const onDisk = JSON.parse(await readFile(`${directory}/config.json`, 'utf8')) as {
      player: { volume: number };
    };
    expect(onDisk.player.volume).toBe(45);
  });

  it('rejects invalid volume levels and seek positions', async () => {
    await expect(controls(['volume', 'loud'])).rejects.toThrow(ValidationError);
    await expect(controls(['volume', '120'])).rejects.toThrow(ValidationError);
    await expect(controls(['seek', '-5'])).rejects.toThrow(ValidationError);
  });

  it('seeks to an absolute position', async () => {
    await play(['play', 'Alpha']);
    const output = await controls(['seek', '90']);
    expect(output).toContain('90');
    expect((await service.player.getSnapshot()).positionSeconds).toBe(90);
  });
});
