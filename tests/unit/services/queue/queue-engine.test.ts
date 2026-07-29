import { describe, expect, it } from 'vitest';

import { createEmptyQueue, type Queue, type Track } from '@/models';
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
} from '@/services/queue';

import { createTrackFixture } from '../../../helpers/fixtures';

/** Deterministic id generator: id-1, id-2, ... */
function makeIds(): () => string {
  let counter = 0;
  return () => `id-${String((counter += 1))}`;
}

/** Builds a queue with three tracks (A, B, C), current at B. */
function makeQueue(): { queue: Queue; tracks: Track[] } {
  const tracks = [
    createTrackFixture({ id: 'A', title: 'Alpha' }),
    createTrackFixture({ id: 'B', title: 'Beta' }),
    createTrackFixture({ id: 'C', title: 'Gamma' }),
  ];
  let queue = enqueueTracks(createEmptyQueue(), tracks, {}, makeIds());
  queue = selectIndex(queue, 1).queue;
  return { queue, tracks };
}

describe('enqueueTracks', () => {
  it('appends items and assigns unique ids', () => {
    const queue = enqueueTracks(
      createEmptyQueue(),
      [createTrackFixture({ id: 'X' }), createTrackFixture({ id: 'Y' })],
      {},
      makeIds(),
    );
    expect(queue.items.map((item) => item.track.id)).toEqual(['X', 'Y']);
    expect(new Set(queue.items.map((item) => item.id)).size).toBe(2);
    expect(queue.currentIndex).toBe(-1);
  });

  it('inserts playNext items right after the current one', () => {
    const { queue } = makeQueue();
    const next = enqueueTracks(
      queue,
      [createTrackFixture({ id: 'Z' })],
      { playNext: true },
      makeIds(),
    );
    expect(next.items.map((item) => item.track.id)).toEqual(['A', 'B', 'Z', 'C']);
    expect(next.currentIndex).toBe(1);
  });

  it('returns the queue unchanged for empty input', () => {
    const { queue } = makeQueue();
    expect(enqueueTracks(queue, [])).toBe(queue);
  });
});

describe('removeItem', () => {
  it('removes items and keeps the current selection when possible', () => {
    const { queue } = makeQueue();
    const removedA = removeItem(queue, queue.items[0]!.id);
    expect(removedA.items.map((item) => item.track.id)).toEqual(['B', 'C']);
    expect(removedA.currentIndex).toBe(0); // B shifted left
  });

  it('adjusts the index when the current item is removed last', () => {
    const { queue } = makeQueue();
    let next = removeItem(queue, queue.items[2]!.id);
    next = removeItem(next, next.items[1]!.id); // remove C, then B? no — B is index 1
    next = removeItem(next, next.items[0]!.id);
    expect(next.items).toHaveLength(0);
    expect(next.currentIndex).toBe(-1);
  });

  it('ignores unknown ids', () => {
    const { queue } = makeQueue();
    expect(removeItem(queue, 'nope')).toBe(queue);
  });
});

describe('clearQueue', () => {
  it('empties items but keeps shuffle/repeat settings', () => {
    const { queue } = makeQueue();
    const configured = setRepeat({ ...queue, shuffle: true }, 'one');
    const cleared = clearQueue(configured);
    expect(cleared.items).toEqual([]);
    expect(cleared.currentIndex).toBe(-1);
    expect(cleared.shuffle).toBe(true);
    expect(cleared.repeat).toBe('one');
  });
});

describe('moveItem', () => {
  it('reorders items and follows the current selection', () => {
    const { queue } = makeQueue();
    const currentId = queue.items[1]!.id; // B
    const moved = moveItem(queue, queue.items[0]!.id, 2); // A to the end
    expect(moved.items.map((item) => item.track.id)).toEqual(['B', 'C', 'A']);
    expect(moved.items[moved.currentIndex]?.id).toBe(currentId);
  });

  it('clamps out-of-range targets', () => {
    const { queue } = makeQueue();
    const moved = moveItem(queue, queue.items[0]!.id, 99);
    expect(moved.items.map((item) => item.track.id)).toEqual(['B', 'C', 'A']);
  });
});

describe('setShuffle', () => {
  it('shuffles only the items after the current one', () => {
    const { queue } = makeQueue();
    const shuffled = setShuffle(queue, true, () => 0.99); // deterministic: reverse-ish
    expect(shuffled.shuffle).toBe(true);
    expect(shuffled.items[0]?.track.id).toBe('A');
    expect(shuffled.items[1]?.track.id).toBe('B'); // current stays put
    expect(shuffled.items).toHaveLength(3);
    expect(shuffled.currentIndex).toBe(1);
  });

  it('disabling keeps the current order', () => {
    const { queue } = makeQueue();
    const shuffled = setShuffle(queue, true, () => 0.5);
    const unshuffled = setShuffle(shuffled, false, () => 0.5);
    expect(unshuffled.shuffle).toBe(false);
    expect(unshuffled.items).toEqual(shuffled.items);
  });

  it('is a no-op when already in the requested state', () => {
    const { queue } = makeQueue();
    expect(setShuffle(queue, false)).toBe(queue);
  });
});

describe('repeat modes', () => {
  it('cycles off → all → one → off', () => {
    const { queue } = makeQueue();
    expect(cycleRepeat(queue).repeat).toBe('all');
    expect(cycleRepeat(cycleRepeat(queue)).repeat).toBe('one');
    expect(cycleRepeat(cycleRepeat(cycleRepeat(queue))).repeat).toBe('off');
  });
});

describe('navigation', () => {
  it('nextItem advances and reports the new current item', () => {
    const { queue } = makeQueue();
    const result = nextItem(queue);
    expect(result.item?.track.id).toBe('C');
    expect(result.queue.currentIndex).toBe(2);
  });

  it('nextItem at the end returns null without repeat', () => {
    const { queue } = makeQueue();
    const atEnd = selectIndex(queue, 2).queue;
    const result = nextItem(atEnd);
    expect(result.item).toBeNull();
    expect(result.queue.currentIndex).toBe(2);
  });

  it('nextItem wraps with repeat=all and replays with repeat=one', () => {
    const { queue } = makeQueue();
    const atEnd = selectIndex(setRepeat(queue, 'all'), 2).queue;
    expect(nextItem(atEnd).item?.track.id).toBe('A');

    const repeatOne = selectIndex(setRepeat(queue, 'one'), 2).queue;
    expect(nextItem(repeatOne).item?.track.id).toBe('C');
    expect(nextItem(repeatOne).queue.currentIndex).toBe(2);
  });

  it('nextItem on an unselected queue selects the first item', () => {
    let queue = enqueueTracks(createEmptyQueue(), [createTrackFixture({ id: 'X' })], {}, makeIds());
    const result = nextItem(queue);
    expect(result.item?.track.id).toBe('X');
    queue = result.queue;
    expect(queue.currentIndex).toBe(0);
  });

  it('previousItem steps back, restarts at the top, wraps with repeat=all', () => {
    const { queue } = makeQueue();
    expect(previousItem(queue).item?.track.id).toBe('A');

    const atStart = selectIndex(queue, 0).queue;
    const restarted = previousItem(atStart);
    expect(restarted.item?.track.id).toBe('A');
    expect(restarted.queue.currentIndex).toBe(0);

    const wrap = previousItem(selectIndex(setRepeat(queue, 'all'), 0).queue);
    expect(wrap.item?.track.id).toBe('C');
  });

  it('jumpToItem selects by instance id', () => {
    const { queue } = makeQueue();
    const target = queue.items[2]!;
    const result = jumpToItem(queue, target.id);
    expect(result.item?.track.id).toBe('C');
    expect(jumpToItem(queue, 'nope').item).toBeNull();
  });

  it('currentItem reflects the selection', () => {
    const { queue } = makeQueue();
    expect(currentItem(queue)?.track.id).toBe('B');
    expect(currentItem(createEmptyQueue())).toBeNull();
  });
});
