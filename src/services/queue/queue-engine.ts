import { randomUUID } from 'node:crypto';

import {
  createEmptyQueue,
  type Queue,
  type QueueItem,
  type RepeatMode,
  type Track,
} from '@/models';

/**
 * Pure queue operations. Every function takes an immutable Queue and
 * returns a new one; nothing here touches I/O, players, or clocks.
 * Playback, persistence and UI all build on these primitives.
 */

/** Options for {@link enqueueTracks}. */
export interface EnqueueOptions {
  /** Insert right after the current item instead of appending to the end. */
  readonly playNext?: boolean;
}

/** Result of a navigation operation; `item` is null when navigation ends. */
export interface NavigationResult {
  readonly queue: Queue;
  readonly item: QueueItem | null;
}

/** Identity function for queue item ids; injectable for deterministic tests. */
export type IdGenerator = () => string;

const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = {
  off: 'all',
  all: 'one',
  one: 'off',
};

/** Returns the item at the queue's current position, if any. */
export function currentItem(queue: Queue): QueueItem | null {
  return queue.items[queue.currentIndex] ?? null;
}

/** Appends tracks to the queue (or right after the current item). */
export function enqueueTracks(
  queue: Queue,
  tracks: readonly Track[],
  options: EnqueueOptions = {},
  createId: IdGenerator = randomUUID,
): Queue {
  if (tracks.length === 0) {
    return queue;
  }
  const items: QueueItem[] = tracks.map((track) => ({ id: createId(), track }));
  const insertAt =
    options.playNext === true && queue.currentIndex >= 0
      ? queue.currentIndex + 1
      : queue.items.length;
  return {
    ...queue,
    items: [...queue.items.slice(0, insertAt), ...items, ...queue.items.slice(insertAt)],
  };
}

/** Removes one item by instance id; unknown ids return the queue unchanged. */
export function removeItem(queue: Queue, itemId: string): Queue {
  const index = queue.items.findIndex((item) => item.id === itemId);
  if (index === -1) {
    return queue;
  }
  const items = queue.items.filter((item) => item.id !== itemId);
  let currentIndex = queue.currentIndex;
  if (index < queue.currentIndex) {
    currentIndex -= 1;
  } else if (index === queue.currentIndex && currentIndex >= items.length) {
    currentIndex = items.length - 1;
  }
  return { ...queue, items, currentIndex };
}

/** Empties the queue while keeping shuffle/repeat settings. */
export function clearQueue(queue: Queue): Queue {
  return { ...createEmptyQueue(), shuffle: queue.shuffle, repeat: queue.repeat };
}

/** Moves an item to a new position; indices are clamped to the queue bounds. */
export function moveItem(queue: Queue, itemId: string, targetIndex: number): Queue {
  const fromIndex = queue.items.findIndex((item) => item.id === itemId);
  if (fromIndex === -1) {
    return queue;
  }
  const clamped = Math.min(queue.items.length - 1, Math.max(0, Math.round(targetIndex)));
  if (clamped === fromIndex) {
    return queue;
  }
  const items = [...queue.items];
  const [moved] = items.splice(fromIndex, 1);
  if (moved === undefined) {
    return queue;
  }
  items.splice(clamped, 0, moved);
  const current = queue.items[queue.currentIndex];
  const currentIndex =
    current === undefined ? queue.currentIndex : items.findIndex((item) => item.id === current.id);
  return { ...queue, items, currentIndex };
}

/**
 * Toggles shuffle. Enabling shuffles the items AFTER the current one
 * (Fisher-Yates), so the playing track is never disturbed. Disabling
 * keeps the current order — the pre-shuffle order is not restored.
 */
export function setShuffle(
  queue: Queue,
  enabled: boolean,
  random: () => number = Math.random,
): Queue {
  if (queue.shuffle === enabled) {
    return queue;
  }
  if (!enabled) {
    return { ...queue, shuffle: false };
  }
  const anchor = queue.currentIndex;
  const fixed = queue.items.slice(0, anchor + 1);
  const rest = queue.items.slice(anchor + 1);
  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    const temp = rest[index];
    const swap = rest[swapWith];
    if (temp !== undefined && swap !== undefined) {
      rest[index] = swap;
      rest[swapWith] = temp;
    }
  }
  return { ...queue, items: [...fixed, ...rest], shuffle: true };
}

/** Sets the repeat mode directly. */
export function setRepeat(queue: Queue, mode: RepeatMode): Queue {
  return { ...queue, repeat: mode };
}

/** Cycles repeat: off → all → one → off. */
export function cycleRepeat(queue: Queue): Queue {
  return { ...queue, repeat: REPEAT_CYCLE[queue.repeat] };
}

/**
 * Advances the queue. Repeat "one" replays the current item; at the end,
 * repeat "all" wraps to the start, otherwise navigation ends (item null).
 */
export function nextItem(queue: Queue): NavigationResult {
  const current = currentItem(queue);
  if (current === null) {
    return selectIndex(queue, queue.items.length > 0 ? 0 : -1);
  }
  if (queue.repeat === 'one') {
    return { queue, item: current };
  }
  if (queue.currentIndex + 1 < queue.items.length) {
    return selectIndex(queue, queue.currentIndex + 1);
  }
  if (queue.repeat === 'all' && queue.items.length > 0) {
    return selectIndex(queue, 0);
  }
  return { queue, item: null };
}

/**
 * Steps back. At the start, repeat "all" wraps to the last item,
 * otherwise the current item is replayed (seek-to-start behavior).
 */
export function previousItem(queue: Queue): NavigationResult {
  const current = currentItem(queue);
  if (current === null) {
    return { queue, item: null };
  }
  if (queue.currentIndex > 0) {
    return selectIndex(queue, queue.currentIndex - 1);
  }
  if (queue.repeat === 'all' && queue.items.length > 1) {
    return selectIndex(queue, queue.items.length - 1);
  }
  return { queue, item: current };
}

/** Selects an item by instance id; unknown ids keep the queue unchanged. */
export function jumpToItem(queue: Queue, itemId: string): NavigationResult {
  const index = queue.items.findIndex((item) => item.id === itemId);
  if (index === -1) {
    return { queue, item: null };
  }
  return selectIndex(queue, index);
}

/** Selects an absolute index; out-of-range indices clear the selection. */
export function selectIndex(queue: Queue, index: number): NavigationResult {
  if (index < 0 || index >= queue.items.length) {
    return { queue: { ...queue, currentIndex: -1 }, item: null };
  }
  const next: Queue = { ...queue, currentIndex: index };
  return { queue: next, item: next.items[index] ?? null };
}
