import { z } from 'zod';

import { VideoIdSchema } from '@/models/ids';

/** A single line of lyrics, optionally timestamped for synchronization. */
export const LyricsLineSchema = z.object({
  text: z.string(),
  /** Line start in milliseconds; null for plain (unsynced) lyrics. */
  startMs: z.number().int().nonnegative().nullable(),
});
export type LyricsLine = z.infer<typeof LyricsLineSchema>;

/** Lyrics for a track. `hasTimestamps` enables sync-highlighting in UIs. */
export const LyricsSchema = z.object({
  trackId: VideoIdSchema,
  lines: z.array(LyricsLineSchema),
  /** Provider attribution as reported by the backend. */
  source: z.string().optional(),
  hasTimestamps: z.boolean(),
});
export type Lyrics = z.infer<typeof LyricsSchema>;
