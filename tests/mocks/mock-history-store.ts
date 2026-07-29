import type { HistoryStore } from '@/core/ports';
import type { HistoryEntry } from '@/models';

/** In-memory HistoryStore fake mirroring SqliteHistoryStore semantics. */
export class MockHistoryStore implements HistoryStore {
  readonly entries: HistoryEntry[] = [];

  append(entry: HistoryEntry): void {
    this.entries.unshift(entry);
  }

  recent(limit: number): HistoryEntry[] {
    return this.entries.slice(0, limit);
  }

  clear(): void {
    this.entries.length = 0;
  }
}
