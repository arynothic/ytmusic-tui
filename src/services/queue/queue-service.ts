import { ValidationError } from '@/core/errors';
import type { QueueStore } from '@/core/ports';
import {
  QueueSnapshotSchema,
  createEmptyQueue,
  type Queue,
  type QueueItem,
  type QueueSnapshot,
  type RepeatMode,
  type SavedQueueInfo,
  type Track,
} from '@/models';
import {
  clearQueue,
  currentItem,
  cycleRepeat,
  enqueueTracks,
  jumpToItem,
  moveItem,
  nextItem,
  previousItem,
  removeItem,
  selectIndex,
  setRepeat,
  setShuffle,
  type EnqueueOptions,
  type IdGenerator,
} from '@/services/queue/queue-engine';

/** Options for {@link QueueService}. */
export interface QueueServiceOptions {
  readonly queueStore: QueueStore;
  /** Queue item id generator, injectable for deterministic tests. */
  readonly idGenerator?: IdGenerator;
  /** Randomness for shuffle, injectable for tests. */
  readonly random?: () => number;
  /** Clock for save timestamps, injectable for tests. */
  readonly now?: () => Date;
}

/**
 * Owns the live play queue and its named persistence. All mutations go
 * through the pure queue engine; this class only adds state, validation
 * and the QueueStore round-trips.
 */
export class QueueService {
  readonly #store: QueueStore;
  readonly #idGenerator: IdGenerator | undefined;
  readonly #random: () => number;
  readonly #now: () => Date;
  #queue: Queue = createEmptyQueue();

  constructor(options: QueueServiceOptions) {
    this.#store = options.queueStore;
    this.#idGenerator = options.idGenerator;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? (() => new Date());
  }

  /** The current live queue (defensive copy-free: treated as immutable). */
  getQueue(): Queue {
    return this.#queue;
  }

  /** Replaces the whole queue, e.g. "play this album now". */
  replaceQueue(tracks: readonly Track[], startIndex = 0): QueueItem | null {
    const queue = enqueueTracks(createEmptyQueue(), tracks, {}, this.#idGenerator);
    const clamped =
      queue.items.length === 0
        ? -1
        : Math.min(Math.max(0, Math.round(startIndex)), queue.items.length - 1);
    const result = selectIndex(queue, clamped);
    this.#queue = result.queue;
    return result.item;
  }

  /** Adds tracks to the queue; returns the created items. */
  enqueue(tracks: readonly Track[], options: EnqueueOptions = {}): QueueItem[] {
    const before = new Set(this.#queue.items.map((item) => item.id));
    this.#queue = enqueueTracks(this.#queue, tracks, options, this.#idGenerator);
    return this.#queue.items.filter((item) => !before.has(item.id));
  }

  /** Removes one item; raises ValidationError for unknown ids. */
  remove(itemId: string): void {
    this.#requireItem(itemId);
    this.#queue = removeItem(this.#queue, itemId);
  }

  /** Empties the live queue. */
  clear(): void {
    this.#queue = clearQueue(this.#queue);
  }

  /** Moves an item to a new position. */
  move(itemId: string, targetIndex: number): void {
    this.#requireItem(itemId);
    this.#queue = moveItem(this.#queue, itemId, targetIndex);
  }

  /** Enables or disables shuffle. */
  setShuffle(enabled: boolean): void {
    this.#queue = setShuffle(this.#queue, enabled, this.#random);
  }

  /** Cycles repeat off → all → one; returns the new mode. */
  cycleRepeat(): RepeatMode {
    this.#queue = cycleRepeat(this.#queue);
    return this.#queue.repeat;
  }

  /** Sets repeat explicitly. */
  setRepeatMode(mode: RepeatMode): void {
    this.#queue = setRepeat(this.#queue, mode);
  }

  /** Advances; returns the newly selected item or null at queue end. */
  next(): QueueItem | null {
    const result = nextItem(this.#queue);
    this.#queue = result.queue;
    return result.item;
  }

  /** Steps back; returns the newly selected item or null when empty. */
  previous(): QueueItem | null {
    const result = previousItem(this.#queue);
    this.#queue = result.queue;
    return result.item;
  }

  /** Selects an item by id; raises ValidationError for unknown ids. */
  jumpTo(itemId: string): QueueItem {
    const result = jumpToItem(this.#queue, itemId);
    if (result.item === null) {
      throw new ValidationError(`No queue item with id "${itemId}"`);
    }
    this.#queue = result.queue;
    return result.item;
  }

  /** The currently selected item, if any. */
  current(): QueueItem | null {
    return currentItem(this.#queue);
  }

  /** Persists the live queue under a name; returns the stored snapshot. */
  saveAs(name: string): QueueSnapshot {
    const trimmed = name.trim();
    if (trimmed === '') {
      throw new ValidationError('Queue name must not be empty');
    }
    const snapshot = QueueSnapshotSchema.parse({
      version: 1,
      name: trimmed,
      savedAt: this.#now().toISOString(),
      queue: this.#queue,
    });
    this.#store.save(trimmed, snapshot);
    return snapshot;
  }

  /** Loads a saved queue into the live queue. */
  restore(name: string): QueueSnapshot {
    const snapshot = this.#store.load(name);
    if (snapshot === undefined) {
      throw new ValidationError(
        `No saved queue named "${name}". Run \`ytmusic queue save-list\` to see saved queues.`,
      );
    }
    this.#queue = snapshot.queue;
    return snapshot;
  }

  /** Lists saved queues, most recently saved first. */
  listSaved(): SavedQueueInfo[] {
    return this.#store.list();
  }

  /** Deletes a saved queue; missing names are not an error. */
  deleteSaved(name: string): void {
    this.#store.remove(name);
  }

  /** Asserts an item id exists in the live queue. */
  #requireItem(itemId: string): void {
    if (!this.#queue.items.some((item) => item.id === itemId)) {
      throw new ValidationError(`No queue item with id "${itemId}"`);
    }
  }
}
