import { z } from 'zod';

/** YouTube video/track id (the `v=` parameter), nominally branded. */
export const VideoIdSchema = z.string().min(1).brand<'VideoId'>();
export type VideoId = z.infer<typeof VideoIdSchema>;

/** YouTube Music playlist id, nominally branded. */
export const PlaylistIdSchema = z.string().min(1).brand<'PlaylistId'>();
export type PlaylistId = z.infer<typeof PlaylistIdSchema>;

/** YouTube Music album browse id, nominally branded. */
export const AlbumIdSchema = z.string().min(1).brand<'AlbumId'>();
export type AlbumId = z.infer<typeof AlbumIdSchema>;

/** YouTube channel id for an artist, nominally branded. */
export const ArtistIdSchema = z.string().min(1).brand<'ArtistId'>();
export type ArtistId = z.infer<typeof ArtistIdSchema>;
