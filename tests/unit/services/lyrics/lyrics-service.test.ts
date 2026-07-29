import { describe, expect, it } from 'vitest';

import { LyricsSchema, VideoIdSchema, type Lyrics } from '@/models';
import { LyricsService } from '@/services/lyrics';

import { createTrackFixture } from '../../../helpers/fixtures';
import { MockCacheStore } from '../../../mocks/mock-cache-store';
import { MockMusicGateway } from '../../../mocks/mock-music-gateway';

const syncedLyrics: Lyrics = LyricsSchema.parse({
  trackId: 'vid001',
  lines: [
    { text: 'intro', startMs: 0 },
    { text: 'verse', startMs: 10_000 },
    { text: 'chorus', startMs: 30_000 },
  ],
  hasTimestamps: true,
  source: 'Musixmatch',
});

const plainLyrics: Lyrics = LyricsSchema.parse({
  trackId: 'vid002',
  lines: [
    { text: 'just', startMs: null },
    { text: 'text', startMs: null },
  ],
  hasTimestamps: false,
});

/** Builds the service with in-memory collaborators. */
function makeService() {
  const gateway = new MockMusicGateway({
    lyricsByTrack: new Map([['vid001', syncedLyrics]]),
  });
  const cache = new MockCacheStore();
  const service = new LyricsService({ gateway, cache, lyricsTtlMs: 60_000 });
  return { service, gateway, cache };
}

describe('LyricsService.getLyrics', () => {
  it('fetches and caches lyrics', async () => {
    const { service, cache } = makeService();
    const lyrics = await service.getLyrics(createTrackFixture({ id: 'vid001' }));
    expect(lyrics?.hasTimestamps).toBe(true);
    expect(cache.data.has('lyrics:vid001')).toBe(true);

    const again = await service.getLyrics(createTrackFixture({ id: 'vid001' }));
    expect(again?.lines).toHaveLength(3);
  });

  it('caches negative results', async () => {
    const { service, cache } = makeService();
    const lyrics = await service.getLyrics(createTrackFixture({ id: 'vid999' }));
    expect(lyrics).toBeNull();
    expect(cache.data.has('lyrics:vid999')).toBe(true);
  });
});

describe('LyricsService.activeLine', () => {
  it('tracks the active line for synced lyrics', () => {
    const { service } = makeService();
    expect(service.activeLine(syncedLyrics, 0)).toBe(0);
    expect(service.activeLine(syncedLyrics, 9_999)).toBe(0);
    expect(service.activeLine(syncedLyrics, 10_000)).toBe(1);
    expect(service.activeLine(syncedLyrics, 45_000)).toBe(2);
  });

  it('returns -1 for unsynced lyrics', () => {
    const { service } = makeService();
    expect(service.activeLine(plainLyrics, 120_000)).toBe(-1);
  });

  it('returns -1 before the first timestamp', () => {
    const { service } = makeService();
    const lyrics = LyricsSchema.parse({
      trackId: VideoIdSchema.parse('vid003'),
      lines: [{ text: 'later', startMs: 5000 }],
      hasTimestamps: true,
    });
    expect(service.activeLine(lyrics, 1000)).toBe(-1);
  });
});
