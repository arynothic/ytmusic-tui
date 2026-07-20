import { describe, expect, it } from 'vitest';

import {
  AlbumDetailsSchema,
  ArtistDetailsSchema,
  CredentialsSchema,
  HistoryEntrySchema,
  LyricsSchema,
  PlaylistDetailsSchema,
  PlaylistTrackSchema,
  QueueSchema,
  QueueSnapshotSchema,
  ResolvedStreamSchema,
  SearchFilterSchema,
  SearchResultsSchema,
  TrackSchema,
  createEmptyQueue,
} from '@/models';

const validTrack = {
  id: 'dQw4w9WgXcQ',
  title: 'Never Gonna Give You Up',
  artists: [{ id: 'UCuAXFkgsw1Lo7X7O6eCmU9g', name: 'Rick Astley' }],
  album: { id: 'MPREb_abc123', title: 'Whenever You Need Somebody' },
  durationSeconds: 213,
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
  isVideo: false,
  isExplicit: false,
};

describe('TrackSchema', () => {
  it('parses a complete track', () => {
    const track = TrackSchema.parse(validTrack);
    expect(track.title).toBe(validTrack.title);
    expect(track.artists[0]?.name).toBe('Rick Astley');
    expect(track.album?.title).toBe('Whenever You Need Somebody');
  });

  it('applies defaults for optional fields', () => {
    const track = TrackSchema.parse({ id: 'abc', title: 'Song', durationSeconds: null });
    expect(track.artists).toEqual([]);
    expect(track.isVideo).toBe(false);
    expect(track.isExplicit).toBe(false);
    expect(track.durationSeconds).toBeNull();
  });

  it('rejects empty titles and negative durations', () => {
    expect(() => TrackSchema.parse({ ...validTrack, title: '' })).toThrowError();
    expect(() => TrackSchema.parse({ ...validTrack, durationSeconds: -1 })).toThrowError();
    expect(() => TrackSchema.parse({ ...validTrack, id: '' })).toThrowError();
  });
});

describe('AlbumDetailsSchema', () => {
  it('parses an album with tracks', () => {
    const album = AlbumDetailsSchema.parse({
      id: 'MPREb_abc123',
      title: 'Whenever You Need Somebody',
      artists: [{ name: 'Rick Astley' }],
      year: '1987',
      tracks: [validTrack],
    });
    expect(album.tracks).toHaveLength(1);
    expect(album.isSingle).toBe(false);
  });
});

describe('ArtistDetailsSchema', () => {
  it('parses an artist page', () => {
    const artist = ArtistDetailsSchema.parse({
      id: 'UCuAXFkgsw1Lo7X7O6eCmU9g',
      name: 'Rick Astley',
      subscriberCount: '3.2M subscribers',
      topTracks: [validTrack],
      albums: [],
      singles: [],
    });
    expect(artist.topTracks).toHaveLength(1);
  });
});

describe('PlaylistDetailsSchema', () => {
  it('parses playlist entries with setVideoId', () => {
    const entry = PlaylistTrackSchema.parse({ ...validTrack, setVideoId: 'SV_123' });
    expect(entry.setVideoId).toBe('SV_123');

    const playlist = PlaylistDetailsSchema.parse({
      id: 'PLabc123',
      title: 'RoadTrip',
      tracks: [entry],
    });
    expect(playlist.tracks[0]?.setVideoId).toBe('SV_123');
  });
});

describe('LyricsSchema', () => {
  it('parses synced lyrics', () => {
    const lyrics = LyricsSchema.parse({
      trackId: validTrack.id,
      lines: [
        { text: 'Never gonna give you up', startMs: 0 },
        { text: 'Never gonna let you down', startMs: 2500 },
      ],
      hasTimestamps: true,
    });
    expect(lyrics.lines[1]?.startMs).toBe(2500);
    expect(lyrics.hasTimestamps).toBe(true);
  });
});

describe('SearchResultsSchema', () => {
  it('defaults categories to empty and allows null filter', () => {
    const results = SearchResultsSchema.parse({
      query: 'coldplay',
      filter: null,
      continuation: null,
    });
    expect(results.tracks).toEqual([]);
    expect(results.filter).toBeNull();
  });

  it('supports every documented filter including podcasts', () => {
    for (const filter of ['songs', 'videos', 'albums', 'artists', 'playlists', 'podcasts']) {
      expect(SearchFilterSchema.parse(filter)).toBe(filter);
    }
    expect(() => SearchFilterSchema.parse('movies')).toThrowError();
  });
});

describe('Queue schemas', () => {
  it('creates an empty queue', () => {
    expect(createEmptyQueue()).toEqual({ items: [], currentIndex: -1, shuffle: false, repeat: 'off' });
  });

  it('parses a queue with items', () => {
    const queue = QueueSchema.parse({
      items: [{ id: 'q1', track: validTrack }],
      currentIndex: 0,
      shuffle: true,
      repeat: 'all',
    });
    expect(queue.items[0]?.track.title).toBe(validTrack.title);
    expect(queue.repeat).toBe('all');
  });

  it('rejects snapshots of the wrong version', () => {
    const snapshot = {
      version: 1,
      name: 'roadtrip',
      savedAt: '2026-07-20T10:00:00.000Z',
      queue: createEmptyQueue(),
    };
    expect(QueueSnapshotSchema.parse(snapshot).name).toBe('roadtrip');
    expect(() => QueueSnapshotSchema.parse({ ...snapshot, version: 2 })).toThrowError();
  });
});

describe('CredentialsSchema', () => {
  it('requires a non-empty cookie and a valid ISO timestamp', () => {
    const credentials = CredentialsSchema.parse({
      cookie: 'SID=abc',
      savedAt: '2026-07-20T10:00:00.000Z',
    });
    expect(credentials.visitorData).toBeUndefined();
    expect(() =>
      CredentialsSchema.parse({ cookie: '', savedAt: '2026-07-20T10:00:00.000Z' }),
    ).toThrowError();
    expect(() => CredentialsSchema.parse({ cookie: 'SID=abc', savedAt: 'yesterday' })).toThrowError();
  });
});

describe('HistoryEntrySchema', () => {
  it('parses a playback event', () => {
    const entry = HistoryEntrySchema.parse({
      track: validTrack,
      playedAt: '2026-07-20T10:00:00.000Z',
    });
    expect(entry.track.id).toBe(validTrack.id);
  });
});

describe('ResolvedStreamSchema', () => {
  it('parses a resolved stream', () => {
    const stream = ResolvedStreamSchema.parse({
      trackId: validTrack.id,
      url: 'https://rr1---sn.example.googlevideo.com/videoplayback?...',
      mimeType: 'audio/webm; codecs="opus"',
      bitrateKbps: 128,
      expiresAt: 1_800_000_000_000,
    });
    expect(stream.bitrateKbps).toBe(128);
  });
});
