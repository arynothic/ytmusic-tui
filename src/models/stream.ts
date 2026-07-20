import { z } from 'zod';

import { VideoIdSchema } from '@/models/ids';

/** A resolved, playable audio URL for a track. */
export const ResolvedStreamSchema = z.object({
  trackId: VideoIdSchema,
  url: z.string().min(1),
  mimeType: z.string().optional(),
  bitrateKbps: z.number().positive().optional(),
  /** Expiry of the URL as epoch milliseconds. */
  expiresAt: z.number().int().positive(),
});
export type ResolvedStream = z.infer<typeof ResolvedStreamSchema>;
