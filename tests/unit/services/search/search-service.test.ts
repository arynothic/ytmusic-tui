import { describe, expect, it } from 'vitest';

import { SearchService } from '@/services/search';

import { createTrackFixture } from '../../../helpers/fixtures';
import { MockCacheStore } from '../../../mocks/mock-cache-store';
import { MockMusicGateway } from '../../../mocks/mock-music-gateway';

/** Builds the service with in-memory collaborators. */
function makeService() {
  const gateway = new MockMusicGateway({
    tracks: [createTrackFixture({ id: 'A', title: 'Fix You' })],
  });
  const cache = new MockCacheStore();
  const service = new SearchService({
    gateway,
    cache,
    searchTtlMs: 60_000,
    defaultLimit: 20,
  });
  return { service, gateway, cache };
}

describe('SearchService', () => {
  it('searches via the gateway and applies the default limit', async () => {
    const { service } = makeService();
    const results = await service.search('fix', 'songs');
    expect(results.tracks.map((track) => track.title)).toEqual(['Fix You']);
    expect(results.filter).toBe('songs');
  });

  it('caches results per query/filter/limit', async () => {
    const { service, cache } = makeService();
    const first = await service.search('fix', 'songs');
    const second = await service.search('FIX', 'songs'); // same normalized key
    expect(second).toEqual(first);
    expect(cache.data.has('search:songs:fix:20')).toBe(true);
  });

  it('separates cache entries by filter and limit', async () => {
    const { service, cache } = makeService();
    await service.search('fix', 'songs');
    await service.search('fix', null);
    await service.search('fix', 'songs', { limit: 5 });
    expect(cache.data.has('search:songs:fix:20')).toBe(true);
    expect(cache.data.has('search:all:fix:20')).toBe(true);
    expect(cache.data.has('search:songs:fix:5')).toBe(true);
  });

  it('trims the query before searching', async () => {
    const { service, cache } = makeService();
    await service.search('  fix  ', 'songs');
    expect(cache.data.has('search:songs:fix:20')).toBe(true);
  });

  it('streams pages straight from the gateway', async () => {
    const { service } = makeService();
    const pages = [];
    for await (const page of service.searchPages('fix', 'songs')) {
      pages.push(page);
    }
    expect(pages).toHaveLength(1);
    expect(pages[0]?.tracks[0]?.title).toBe('Fix You');
  });
});
