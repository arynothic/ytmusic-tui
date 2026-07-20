import { z } from 'zod';

import { PlaylistIdSchema } from '@/models/ids';
import { TrackSchema } from '@/models/track';

/** Privacy levels supported by YouTube Music playlists. */
export const PlaylistPrivacySchema = z.enum(['PRIVATE', 'PUBLIC', 'UNLISTED']);
export type PlaylistPrivacy = z.infer<typeof PlaylistPrivacySchema>;

/**
 * A track inside a playlist. `setVideoId` identifies the playlist entry
 * (distinct from the track id) and is required to remove the entry.
 */
export const PlaylistTrackSchema = TrackSchema.extend({
  setVideoId: z.string().optional(),
});
export type PlaylistTrack = z.infer<typeof PlaylistTrackSchema>;

/** A playlist as referenced from lists and search results. */
export const PlaylistSchema = z.object({
  id: PlaylistIdSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  trackCount: z.number().int().nonnegative().optional(),
});
export type Playlist = z.infer<typeof PlaylistSchema>;

/** Full playlist page including its entries. */
export const PlaylistDetailsSchema = PlaylistSchema.extend({
  tracks: z.array(PlaylistTrackSchema).default([]),
});
export type PlaylistDetails = z.infer<typeof PlaylistDetailsSchema>;
