import type { QueueStore } from '@/core/ports';
import type { QueueSnapshot, SavedQueueInfo } from '@/models';

/** In-memory QueueStore fake mirroring SqliteQueueStore semantics. */
export class MockQueueStore implements QueueStore {
  readonly data = new Map<string, QueueSnapshot>();

  save(name: string, snapshot: QueueSnapshot): void {
    this.data.set(name, snapshot);
  }

  load(name: string): QueueSnapshot | undefined {
    return this.data.get(name);
  }

  list(): SavedQueueInfo[] {
    return [...this.data.values()]
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .map((snapshot) => ({
        name: snapshot.name,
        savedAt: snapshot.savedAt,
        itemCount: snapshot.queue.items.length,
      }));
  }

  remove(name: string): void {
    this.data.delete(name);
  }
}
