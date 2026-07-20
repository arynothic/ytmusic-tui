import type { QueueSnapshot, SavedQueueInfo } from '@/models';

/** Port for persisting named play queues. */
export interface QueueStore {
  /** Saves a queue under a name, overwriting any previous snapshot. */
  save(name: string, snapshot: QueueSnapshot): void;

  /** Loads a previously saved queue, undefined when absent. */
  load(name: string): QueueSnapshot | undefined;

  /** Lists all saved queues, most recently saved first. */
  list(): SavedQueueInfo[];

  /** Deletes a saved queue; missing names are not an error. */
  remove(name: string): void;
}
