import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAlbumCommand } from '@/commands/album';
import { registerArtistCommand } from '@/commands/artist';
import { registerDownloadCommand } from '@/commands/download';

import {
  createAlbumDetailsFixture,
  createArtistDetailsFixture,
  createTrackFixture,
} from '../helpers/fixtures';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('artist command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      artists: [createArtistDetailsFixture({ id: 'UC1', name: 'Rick Astley' })],
    });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('shows the artist page with top songs and albums', async () => {
    const output = await runCli(registerArtistCommand, service.context, ['artist', 'Rick']);
    expect(output).toContain('Rick Astley');
    expect(output).toContain('4.2M subscribers');
    expect(output).toContain('Top songs');
    expect(output).toContain('Track One');
    expect(output).toContain('Albums');
    expect(output).toContain('Whenever You Need Somebody');
  });

  it('warns when no artist matches', async () => {
    const output = await runCli(registerArtistCommand, service.context, ['artist', 'zzzz']);
    expect(output).toContain('No artists found');
  });
});

describe('album command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, {
      albums: [createAlbumDetailsFixture({ id: 'AL1', title: 'Whenever You Need Somebody' })],
    });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('shows the album with its tracks', async () => {
    const output = await runCli(registerAlbumCommand, service.context, ['album', 'Whenever']);
    expect(output).toContain('Whenever You Need Somebody');
    expect(output).toContain('1987');
    expect(output).toContain('Track One');
    expect(output).toContain('Track Two');
  });

  it('warns when no album matches', async () => {
    const output = await runCli(registerAlbumCommand, service.context, ['album', 'zzzz']);
    expect(output).toContain('No albums found');
  });
});

describe('download command', () => {
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

  it('downloads the first match and prints the saved path', async () => {
    const output = await runCli(registerDownloadCommand, service.context, ['download', 'Fix You']);
    expect(output).toContain('Saved:');
    expect(output).toContain('.webm');
    expect(service.downloadRun.calls).toHaveLength(1);
    expect(service.downloadRun.calls[0]?.args.join(' ')).toContain('watch?v=v1');
  });

  it('warns when nothing matches', async () => {
    const output = await runCli(registerDownloadCommand, service.context, ['download', 'zzzz']);
    expect(output).toContain('No tracks found');
    expect(service.downloadRun.calls).toHaveLength(0);
  });
});
