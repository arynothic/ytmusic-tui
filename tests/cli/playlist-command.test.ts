import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerPlaylistCommand } from '@/commands/playlist';
import { AuthError, ValidationError } from '@/core/errors';

import { createTrackFixture } from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { login, runCli } from './helpers';

describe('playlist command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      tracks: [createTrackFixture({ id: 'v1', title: 'Fix You' })],
    });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  function playlist(argv: string[]): Promise<string> {
    return runCli(registerPlaylistCommand, service.context, argv);
  }

  it('requires authentication', async () => {
    await expect(playlist(['playlist', 'list'])).rejects.toThrow(AuthError);
  });

  it('creates, lists, shows, renames and deletes playlists', async () => {
    await login(service);

    expect(await playlist(['playlist', 'create', 'RoadTrip'])).toContain(
      'Created playlist "RoadTrip"',
    );

    const list = await playlist(['playlist', 'list']);
    expect(list).toContain('RoadTrip');

    const show = await playlist(['playlist', 'show', 'RoadTrip']);
    expect(show).toContain('RoadTrip');

    expect(await playlist(['playlist', 'rename', 'RoadTrip', 'Chill'])).toContain(
      'Renamed playlist to "Chill"',
    );
    expect(await playlist(['playlist', 'list'])).toContain('Chill');

    expect(await playlist(['playlist', 'delete', 'Chill'])).toContain('Playlist deleted');
    expect(await playlist(['playlist', 'list'])).toContain('no playlists');
  });

  it('adds and removes tracks', async () => {
    await login(service);
    await playlist(['playlist', 'create', 'Mix']);

    expect(await playlist(['playlist', 'add', 'Mix', 'Fix You'])).toContain(
      'Added "Fix You" to the playlist',
    );
    const show = await playlist(['playlist', 'show', 'Mix']);
    expect(show).toContain('Fix You');

    expect(await playlist(['playlist', 'remove', 'Mix', '1'])).toContain(
      'Removed "Fix You" from the playlist',
    );
  });

  it('rejects invalid remove indices and unknown playlists', async () => {
    await login(service);
    await playlist(['playlist', 'create', 'Mix']);
    await playlist(['playlist', 'add', 'Mix', 'Fix You']);

    await expect(playlist(['playlist', 'remove', 'Mix', '42'])).rejects.toThrow(ValidationError);
    await expect(playlist(['playlist', 'show', 'does-not-exist'])).rejects.toThrow(ValidationError);
  });
});
