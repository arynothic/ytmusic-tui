import { z } from 'zod';

import { ArtistIdSchema } from '@/models/ids';

/**
 * An artist as referenced from tracks, albums and search results.
 * Kept free of imports from other model entities so the model graph
 * stays acyclic: artist ← track ← album ← artist-details.
 */
export const ArtistSchema = z.object({
  /** Channel id; absent when the source only exposes a name. */
  id: ArtistIdSchema.optional(),
  name: z.string().min(1),
});
export type Artist = z.infer<typeof ArtistSchema>;
