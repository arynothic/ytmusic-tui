import { z } from 'zod';

import { AlbumSchema } from '@/models/album';
import { ArtistSchema } from '@/models/artist';
import { PlaylistSchema } from '@/models/playlist';
import { TrackSchema } from '@/models/track';

/** Search categories supported by YouTube Music. */
export const SearchFilterSchema = z.enum([
  'songs',
  'videos',
  'albums',
  'artists',
  'playlists',
  'podcasts',
]);
export type SearchFilter = z.infer<typeof SearchFilterSchema>;

/**
 * One page of search results. `filter` is null for mixed "top results".
 * `continuation` is the opaque token for fetching the next page.
 */
export const SearchResultsSchema = z.object({
  query: z.string(),
  filter: SearchFilterSchema.nullable(),
  tracks: z.array(TrackSchema).default([]),
  albums: z.array(AlbumSchema).default([]),
  artists: z.array(ArtistSchema).default([]),
  playlists: z.array(PlaylistSchema).default([]),
  continuation: z.string().nullable(),
});
export type SearchResults = z.infer<typeof SearchResultsSchema>;
