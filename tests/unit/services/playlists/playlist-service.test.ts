import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/core/errors';
import { LIBRARY_CACHE_KEYS } from '@/services/library';
import { PlaylistService } from '@/services/playlists';

import { createTrackFixture } from '../../../helpers/fixtures';
import { MockCacheStore } from '../../../mocks/mock-cache-store';
import { MockMusicGateway } from '../../../mocks/mock-music-gateway';

/** Builds the service with in-memory collaborators. */
function makeService() {
  const gateway = new MockMusicGateway({
    tracks: [createTrackFixture({ id: 'vid001' }), createTrackFixture({ id: 'vid002' })],
  });
  const cache = new MockCacheStore();
  const service = new PlaylistService({ gateway, cache });
  return { service, gateway, cache };
}

describe('PlaylistService', () => {
  it('creates playlists and invalidates the library cache', async () => {
    const { service, cache } = makeService();
    cache.set(LIBRARY_CACHE_KEYS.playlists, [], 60_000);

    const playlist = await service.create({ title: 'RoadTrip' });
    expect(playlist.title).toBe('RoadTrip');
    expect(cache.data.has(LIBRARY_CACHE_KEYS.playlists)).toBe(false);
  });

  it('trims and validates titles', async () => {
    const { service, gateway } = makeService();
    const playlist = await service.create({ title: '  Chill  ' });
    expect(playlist.title).toBe('Chill');
    expect(gateway.playlists.at(-1)?.title).toBe('Chill');

    await expect(service.create({ title: '   ' })).rejects.toThrow(ValidationError);
    await expect(service.rename('PLx', ' ')).rejects.toThrow(ValidationError);
  });

  it('renames and deletes playlists', async () => {
    const { service, gateway } = makeService();
    const created = await service.create({ title: 'Old' });

    await service.rename(created.id, 'New');
    expect(gateway.playlists.find((playlist) => playlist.id === created.id)?.title).toBe('New');

    await service.delete(created.id);
    expect(gateway.playlists.find((playlist) => playlist.id === created.id)).toBeUndefined();
  });

  it('adds and removes tracks with id validation', async () => {
    const { service, gateway } = makeService();
    const created = await service.create({ title: 'Mix' });

    await service.addTracks(created.id, ['vid001', 'vid002']);
    const details = gateway.playlists.find((playlist) => playlist.id === created.id);
    expect(details?.tracks.map((track) => track.id)).toEqual(['vid001', 'vid002']);

    const setVideoIds = details?.tracks.map((track) => track.setVideoId ?? '') ?? [];
    await service.removeTracks(created.id, [setVideoIds[0]!]);
    expect(gateway.playlists.find((playlist) => playlist.id === created.id)?.tracks).toHaveLength(
      1,
    );

    await expect(service.addTracks(created.id, [])).rejects.toThrow(ValidationError);
    await expect(service.addTracks(created.id, [''])).rejects.toThrow(ValidationError);
  });

  it('fetches playlist details by id', async () => {
    const { service } = makeService();
    const created = await service.create({ title: 'Mix' });
    const details = await service.get(created.id);
    expect(details.id).toBe(created.id);
  });
});
