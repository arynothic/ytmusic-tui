import { describe, expect, it } from 'vitest';

import { LIBRARY_CACHE_KEYS, LibraryService } from '@/services/library';

import { createTrackFixture } from '../../../helpers/fixtures';
import { MockCacheStore } from '../../../mocks/mock-cache-store';
import { MockHistoryStore } from '../../../mocks/mock-history-store';
import { MockMusicGateway } from '../../../mocks/mock-music-gateway';

/** Builds the service with in-memory collaborators. */
function makeService() {
  const gateway = new MockMusicGateway({
    tracks: [createTrackFixture({ id: 'A' }), createTrackFixture({ id: 'B' })],
    likedSongs: [createTrackFixture({ id: 'L1' }), createTrackFixture({ id: 'L2' })],
  });
  const cache = new MockCacheStore();
  const history = new MockHistoryStore();
  const service = new LibraryService({
    gateway,
    cache,
    historyStore: history,
    metadataTtlMs: 86_400_000,
    volatileTtlMs: 300_000,
  });
  return { service, gateway, cache, history };
}

describe('LibraryService', () => {
  it('caches liked songs and slices by limit', async () => {
    const { service, cache } = makeService();
    const all = await service.getLikedSongs();
    expect(all.map((track) => track.id)).toEqual(['L1', 'L2']);
    expect(cache.data.has(LIBRARY_CACHE_KEYS.likedSongs)).toBe(true);

    const limited = await service.getLikedSongs({ limit: 1 });
    expect(limited.map((track) => track.id)).toEqual(['L1']);
  });

  it('caches albums/artists/playlists under the shared keys', async () => {
    const { service, cache } = makeService();
    await service.getAlbums();
    await service.getArtists();
    await service.getPlaylists();
    expect(cache.data.has(LIBRARY_CACHE_KEYS.albums)).toBe(true);
    expect(cache.data.has(LIBRARY_CACHE_KEYS.artists)).toBe(true);
    expect(cache.data.has(LIBRARY_CACHE_KEYS.playlists)).toBe(true);
  });

  it('exposes local history and clears it', async () => {
    const { service, history } = makeService();
    history.append({ track: createTrackFixture({ id: 'H1' }), playedAt: '2026-07-29T09:00:00Z' });
    history.append({ track: createTrackFixture({ id: 'H2' }), playedAt: '2026-07-29T10:00:00Z' });

    expect(service.getLocalHistory(10).map((entry) => entry.track.id)).toEqual(['H2', 'H1']);
    service.clearLocalHistory();
    expect(service.getLocalHistory(10)).toEqual([]);
  });

  it('passes remote history through with its limit', async () => {
    const { service } = makeService();
    const remote = await service.getRemoteHistory({ limit: 5 });
    expect(Array.isArray(remote)).toBe(true);
  });

  it('invalidate drops all cached lists', async () => {
    const { service, cache } = makeService();
    await service.getLikedSongs();
    await service.getAlbums();
    service.invalidate();
    expect(cache.data.size).toBe(0);
  });
});
