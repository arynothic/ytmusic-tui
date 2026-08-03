import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerSearchCommand } from '@/commands/search';
import { ValidationError } from '@/core/errors';

import {
  createAlbumDetailsFixture,
  createArtistDetailsFixture,
  createTrackFixture,
} from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('search command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      tracks: [
        createTrackFixture({ id: 'v1', title: 'Fix You', durationSeconds: 295 }),
        createTrackFixture({ id: 'v2', title: 'Yellow', durationSeconds: 269 }),
      ],
      albums: [createAlbumDetailsFixture({ id: 'AL1', title: 'Fix Tapes' })],
      artists: [createArtistDetailsFixture({ id: 'AR1', name: 'The Fixers' })],
      playlists: [],
    });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('prints matching tracks in a table', async () => {
    const output = await runCli(registerSearchCommand, service.context, ['search', 'Fix You']);
    expect(output).toContain('Results for "Fix You"');
    expect(output).toContain('Fix You');
    expect(output).toContain('4:55');
  });

  it('prints album and artist sections for mixed searches', async () => {
    const output = await runCli(registerSearchCommand, service.context, ['search', 'Fix']);
    expect(output).toContain('Songs');
    expect(output).toContain('Albums');
    expect(output).toContain('Fix Tapes');
    expect(output).toContain('Artists');
    expect(output).toContain('The Fixers');
  });

  it('prints only the requested section with --type', async () => {
    const output = await runCli(registerSearchCommand, service.context, [
      'search',
      'Fix',
      '--type',
      'albums',
    ]);
    expect(output).toContain('(albums)');
    expect(output).toContain('Fix Tapes');
    expect(output).not.toContain('Songs');
  });

  it('warns when nothing matches', async () => {
    const output = await runCli(registerSearchCommand, service.context, ['search', 'zzzz']);
    expect(output).toContain('No results');
  });

  it('rejects an invalid --type', async () => {
    await expect(
      runCli(registerSearchCommand, service.context, ['search', 'x', '--type', 'bogus']),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an invalid --limit', async () => {
    await expect(
      runCli(registerSearchCommand, service.context, ['search', 'x', '--limit', '999']),
    ).rejects.toThrow(ValidationError);
  });

  it('filters by type', async () => {
    const output = await runCli(registerSearchCommand, service.context, [
      'search',
      'Fix',
      '--type',
      'songs',
    ]);
    expect(output).toContain('(songs)');
    expect(output).toContain('Songs');
  });
});
