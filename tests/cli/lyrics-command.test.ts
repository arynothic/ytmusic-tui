import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerLyricsCommand } from '@/commands/lyrics';

import { createLyricsFixture, createTrackFixture } from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('lyrics command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      tracks: [
        createTrackFixture({ id: 'v1', title: 'Fix You' }),
        createTrackFixture({ id: 'v2', title: 'Wordless Song' }),
      ],
      lyricsByTrack: new Map([['v1', createLyricsFixture({ trackId: 'v1' })]]),
    });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('prints lyrics for a searched track', async () => {
    const output = await runCli(registerLyricsCommand, service.context, ['lyrics', 'Fix You']);
    expect(output).toContain('Never gonna give you up');
    expect(output).toContain('Never gonna let you down');
    expect(output).toContain('Source: Musixmatch');
  });

  it('warns when no lyrics exist', async () => {
    const output = await runCli(registerLyricsCommand, service.context, ['lyrics', 'Wordless']);
    expect(output).toContain('No lyrics found');
  });

  it('warns when nothing is playing and no query is given', async () => {
    const output = await runCli(registerLyricsCommand, service.context, ['lyrics']);
    expect(output).toContain('Nothing is playing');
  });
});
