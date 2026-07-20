import { z } from 'zod';

import { ArtistSchema } from '@/models/artist';
import { AlbumIdSchema } from '@/models/ids';
import { TrackSchema } from '@/models/track';

/** An album as referenced from search results and artist pages. */
export const AlbumSchema = z.object({
  id: AlbumIdSchema,
  title: z.string().min(1),
  artists: z.array(ArtistSchema).default([]),
  /** Release year as display text, e.g. "2000". */
  year: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  trackCount: z.number().int().nonnegative().optional(),
  /** True for singles/EPs as reported by the backend. */
  isSingle: z.boolean().default(false),
});
export type Album = z.infer<typeof AlbumSchema>;

/** Full album page including its track list. */
export const AlbumDetailsSchema = AlbumSchema.extend({
  description: z.string().optional(),
  tracks: z.array(TrackSchema).default([]),
});
export type AlbumDetails = z.infer<typeof AlbumDetailsSchema>;
