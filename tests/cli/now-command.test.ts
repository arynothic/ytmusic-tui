import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerNowCommand } from '@/commands/now';
import { registerPlayCommand } from '@/commands/play';

import { createTrackFixture } from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('now command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      tracks: [createTrackFixture({ id: 'v1', title: 'Fix You', durationSeconds: 295 })],
    });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('reports when nothing is playing', async () => {
    const output = await runCli(registerNowCommand, service.context, ['now']);
    expect(output).toContain('Nothing is playing.');
  });

  it('shows the current track with queue position', async () => {
    await runCli(registerPlayCommand, service.context, ['play', 'Fix You']);

    const output = await runCli(registerNowCommand, service.context, ['now']);
    expect(output).toContain('Fix You');
    expect(output).toContain('Rick Astley');
    expect(output).toContain('4:55');
    expect(output).toContain('queue 1/1');
  });
});
