import {
  AlbumDetailsSchema,
  ArtistDetailsSchema,
  LyricsSchema,
  TrackSchema,
  type AlbumDetails,
  type ArtistDetails,
  type Lyrics,
  type Track,
} from '@/models';

/** Builds a valid Track for tests with overridable fields. */
export function createTrackFixture(overrides: Record<string, unknown> = {}): Track {
  return TrackSchema.parse({
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artists: [{ id: 'UCuAXFkgsw1Lo7X7O6eCmU9g', name: 'Rick Astley' }],
    album: { id: 'MPREb_abc123', title: 'Whenever You Need Somebody' },
    durationSeconds: 213,
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
    isVideo: false,
    isExplicit: false,
    ...overrides,
  });
}

/** Builds a valid AlbumDetails for tests with overridable fields. */
export function createAlbumDetailsFixture(overrides: Record<string, unknown> = {}): AlbumDetails {
  return AlbumDetailsSchema.parse({
    id: 'MPREb_abc123',
    title: 'Whenever You Need Somebody',
    artists: [{ id: 'UCuAXFkgsw1Lo7X7O6eCmU9g', name: 'Rick Astley' }],
    year: '1987',
    trackCount: 2,
    tracks: [
      createTrackFixture({ id: 't1', title: 'Track One' }),
      createTrackFixture({ id: 't2', title: 'Track Two' }),
    ],
    ...overrides,
  });
}

/** Builds a valid ArtistDetails for tests with overridable fields. */
export function createArtistDetailsFixture(overrides: Record<string, unknown> = {}): ArtistDetails {
  return ArtistDetailsSchema.parse({
    id: 'UCuAXFkgsw1Lo7X7O6eCmU9g',
    name: 'Rick Astley',
    subscriberCount: '4.2M subscribers',
    topTracks: [createTrackFixture({ id: 't1', title: 'Track One' })],
    albums: [createAlbumDetailsFixture()],
    ...overrides,
  });
}

/** Builds valid Lyrics for tests with overridable fields. */
export function createLyricsFixture(overrides: Record<string, unknown> = {}): Lyrics {
  return LyricsSchema.parse({
    trackId: 'dQw4w9WgXcQ',
    lines: [
      { text: 'Never gonna give you up', startMs: null },
      { text: 'Never gonna let you down', startMs: null },
    ],
    hasTimestamps: false,
    source: 'Musixmatch',
    ...overrides,
  });
}
