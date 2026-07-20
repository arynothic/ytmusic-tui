import { TrackSchema, type Track } from '@/models';

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
