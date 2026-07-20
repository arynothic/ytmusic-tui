import { z } from 'zod';

import { ArtistSchema } from '@/models/artist';
import { AlbumIdSchema, VideoIdSchema } from '@/models/ids';

/**
 * Minimal album reference embedded in a track. Kept here (instead of
 * importing AlbumSchema) to keep the model import graph acyclic:
 * track ← album ← artist.
 */
export const AlbumRefSchema = z.object({
  id: AlbumIdSchema,
  title: z.string().min(1),
});
export type AlbumRef = z.infer<typeof AlbumRefSchema>;

/** A playable YouTube Music track (song or music video). */
export const TrackSchema = z.object({
  id: VideoIdSchema,
  title: z.string().min(1),
  artists: z.array(ArtistSchema).default([]),
  album: AlbumRefSchema.optional(),
  /** Duration in whole seconds; null when the source does not report it. */
  durationSeconds: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().optional(),
  /** True for music videos, false for audio-only songs. */
  isVideo: z.boolean().default(false),
  /** True when the track carries an explicit-content badge. */
  isExplicit: z.boolean().default(false),
});
export type Track = z.infer<typeof TrackSchema>;
