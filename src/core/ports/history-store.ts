import type { HistoryEntry } from '@/models';

/** Port for the local playback history log. */
export interface HistoryStore {
  /** Records a playback event. */
  append(entry: HistoryEntry): void;

  /** Most recent entries first. */
  recent(limit: number): HistoryEntry[];

  clear(): void;
}
