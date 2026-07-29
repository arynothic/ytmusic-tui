import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/core/errors';
import { QueueService } from '@/services/queue';

import { createTrackFixture } from '../../../helpers/fixtures';
import { MockQueueStore } from '../../../mocks/mock-queue-store';

/** Creates a service with deterministic ids and a fixed clock. */
function makeService() {
  const store = new MockQueueStore();
  let counter = 0;
  const service = new QueueService({
    queueStore: store,
    idGenerator: () => `qid-${String((counter += 1))}`,
    random: () => 0.5,
    now: () => new Date('2026-07-29T10:00:00.000Z'),
  });
  return { service, store };
}

const trackA = createTrackFixture({ id: 'A', title: 'Alpha' });
const trackB = createTrackFixture({ id: 'B', title: 'Beta' });

describe('QueueService live queue', () => {
  it('enqueues, navigates and reports the current item', () => {
    const { service } = makeService();
    service.enqueue([trackA, trackB]);

    expect(service.getQueue().items).toHaveLength(2);
    expect(service.current()).toBeNull();

    expect(service.next()?.track.id).toBe('A');
    expect(service.current()?.track.id).toBe('A');
    expect(service.next()?.track.id).toBe('B');
    expect(service.next()).toBeNull();
  });

  it('replaceQueue resets the queue and selects the start index', () => {
    const { service } = makeService();
    const item = service.replaceQueue([trackA, trackB], 1);
    expect(item?.track.id).toBe('B');
    expect(service.getQueue().currentIndex).toBe(1);
  });

  it('validates item ids for remove/move/jumpTo', () => {
    const { service } = makeService();
    service.enqueue([trackA]);
    expect(() => service.remove('nope')).toThrow(ValidationError);
    expect(() => service.move('nope', 0)).toThrow(ValidationError);
    expect(() => service.jumpTo('nope')).toThrow(ValidationError);
  });

  it('cycles repeat modes and toggles shuffle', () => {
    const { service } = makeService();
    expect(service.cycleRepeat()).toBe('all');
    expect(service.cycleRepeat()).toBe('one');
    service.setRepeatMode('off');
    service.setShuffle(true);
    expect(service.getQueue().shuffle).toBe(true);
  });

  it('clears the queue', () => {
    const { service } = makeService();
    service.enqueue([trackA, trackB]);
    service.clear();
    expect(service.getQueue().items).toEqual([]);
  });
});

describe('QueueService saved queues', () => {
  it('saves, lists, restores and deletes named queues', () => {
    const { service, store } = makeService();
    service.enqueue([trackA, trackB]);
    service.next();

    const snapshot = service.saveAs('roadtrip');
    expect(snapshot.savedAt).toBe('2026-07-29T10:00:00.000Z');
    expect(snapshot.queue.items).toHaveLength(2);

    expect(service.listSaved()).toEqual([
      { name: 'roadtrip', savedAt: '2026-07-29T10:00:00.000Z', itemCount: 2 },
    ]);
    expect(store.data.has('roadtrip')).toBe(true);

    service.clear();
    const restored = service.restore('roadtrip');
    expect(restored.queue.currentIndex).toBe(0);
    expect(service.getQueue().items).toHaveLength(2);

    service.deleteSaved('roadtrip');
    expect(service.listSaved()).toEqual([]);
  });

  it('rejects empty names and unknown saved queues', () => {
    const { service } = makeService();
    expect(() => service.saveAs('   ')).toThrow(ValidationError);
    expect(() => service.restore('missing')).toThrow(ValidationError);
  });
});
