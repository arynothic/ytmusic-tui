import { z } from 'zod';

import { TrackSchema } from '@/models/track';

/** A locally recorded playback event. */
export const HistoryEntrySchema = z.object({
  track: TrackSchema,
  /** ISO timestamp of when playback started. */
  playedAt: z.iso.datetime(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
