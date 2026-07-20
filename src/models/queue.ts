import { z } from 'zod';

import { TrackSchema } from '@/models/track';

/** Repeat behavior of the play queue. */
export const RepeatModeSchema = z.enum(['off', 'all', 'one']);
export type RepeatMode = z.infer<typeof RepeatModeSchema>;

/** A queued track. `id` is a unique instance id (uuid) within the queue. */
export const QueueItemSchema = z.object({
  id: z.string().min(1),
  track: TrackSchema,
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

/**
 * The play queue. `currentIndex` is -1 when nothing is selected yet.
 */
export const QueueSchema = z.object({
  items: z.array(QueueItemSchema),
  currentIndex: z.number().int().min(-1),
  shuffle: z.boolean(),
  repeat: RepeatModeSchema,
});
export type Queue = z.infer<typeof QueueSchema>;

/** Persisted queue, versioned for forward-compatible migrations. */
export const QueueSnapshotSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  savedAt: z.iso.datetime(),
  queue: QueueSchema,
});
export type QueueSnapshot = z.infer<typeof QueueSnapshotSchema>;

/** Summary of a persisted queue, used when listing saved queues. */
export const SavedQueueInfoSchema = z.object({
  name: z.string().min(1),
  savedAt: z.iso.datetime(),
  itemCount: z.number().int().nonnegative(),
});
export type SavedQueueInfo = z.infer<typeof SavedQueueInfoSchema>;

/** Creates an empty queue. */
export function createEmptyQueue(): Queue {
  return { items: [], currentIndex: -1, shuffle: false, repeat: 'off' };
}
