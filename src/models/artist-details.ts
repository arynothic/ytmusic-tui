import { z } from 'zod';

import { AlbumSchema } from '@/models/album';
import { ArtistIdSchema } from '@/models/ids';
import { TrackSchema } from '@/models/track';

/** Full artist page: metadata plus top tracks and discography. */
export const ArtistDetailsSchema = z.object({
  id: ArtistIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  /** Display text as returned by the backend, e.g. "12.4M subscribers". */
  subscriberCount: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  topTracks: z.array(TrackSchema).default([]),
  albums: z.array(AlbumSchema).default([]),
  singles: z.array(AlbumSchema).default([]),
});
export type ArtistDetails = z.infer<typeof ArtistDetailsSchema>;
