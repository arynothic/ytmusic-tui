import type { Logger } from 'pino';

import { invariant, ValidationError } from '@/core/errors';
import type {
  HistoryStore,
  PlayerBackend,
  PlayerSnapshot,
  PlayerStatus,
  StreamResolver,
} from '@/core/ports';
import type { QueueItem, Track } from '@/models';
import type { QueueService } from '@/services/queue/queue-service';

/** Options for {@link PlaybackService}. */
export interface PlaybackServiceOptions {
  readonly player: PlayerBackend;
  readonly streamResolver: StreamResolver;
  readonly queueService: QueueService;
  readonly historyStore: HistoryStore;
  readonly logger?: Logger;
  /** Clock for history timestamps, injectable for tests. */
  readonly now?: () => Date;
}

/** Point-in-time answer to "what is playing right now". */
export interface NowPlaying {
  /** Raw player snapshot (status, position, volume). */
  readonly snapshot: PlayerSnapshot;
  /** The queue item being played, when playback is queue-driven. */
  readonly item: QueueItem | null;
  /** 1-based position of the current item in the queue; 0 when none. */
  readonly position: number;
  /** Total number of items in the queue. */
  readonly total: number;
  readonly shuffle: boolean;
  readonly repeat: 'off' | 'all' | 'one';
}

/**
 * Orchestrates playback: queue navigation, stream URL resolution, the
 * player backend, and history recording. When the backend reports a
 * naturally finished track (status → idle), the queue auto-advances.
 */
export class PlaybackService {
  readonly #player: PlayerBackend;
  readonly #streamResolver: StreamResolver;
  readonly #queueService: QueueService;
  readonly #historyStore: HistoryStore;
  readonly #logger: Logger | undefined;
  readonly #now: () => Date;
  readonly #unsubscribe: () => void;
  /** Serializes auto-advance so duplicate idle events cannot double-skip. */
  #advancing: Promise<void> | null = null;
  /** Last status seen, so only a real transition to idle advances. */
  #lastStatus: PlayerStatus | null = null;

  constructor(options: PlaybackServiceOptions) {
    this.#player = options.player;
    this.#streamResolver = options.streamResolver;
    this.#queueService = options.queueService;
    this.#historyStore = options.historyStore;
    this.#logger = options.logger;
    this.#now = options.now ?? (() => new Date());
    this.#unsubscribe = this.#player.onStateChange((snapshot) => {
      const previous = this.#lastStatus;
      this.#lastStatus = snapshot.status;
      // Only an actual end-of-track (playing/paused → idle) should advance.
      // Backends emit property updates (e.g. volume) before playback begins,
      // which report a still-idle snapshot; those must be ignored.
      if (snapshot.status === 'idle' && (previous === 'playing' || previous === 'paused')) {
        this.#onTrackEnded();
      }
    });
  }

  /**
   * Replaces the queue with the given tracks and starts playback at the
   * chosen index. Returns the track that started playing.
   */
  async playTracks(
    tracks: readonly Track[],
    options: { startIndex?: number } = {},
  ): Promise<Track> {
    if (tracks.length === 0) {
      throw new ValidationError('Nothing to play: the track list is empty');
    }
    const item = this.#queueService.replaceQueue(tracks, options.startIndex ?? 0);
    invariant(item !== null, 'a non-empty queue always yields a selected item');
    return this.#startItem(item);
  }

  /** Plays a specific queue item. */
  async playItem(itemId: string): Promise<Track> {
    const item = this.#queueService.jumpTo(itemId);
    return this.#startItem(item);
  }

  /** Advances the queue and plays the next track; null at queue end. */
  async next(): Promise<Track | null> {
    const item = this.#queueService.next();
    if (item === null) {
      await this.#player.stop();
      return null;
    }
    return this.#startItem(item);
  }

  /** Steps back in the queue and plays the previous track. */
  async previous(): Promise<Track | null> {
    const item = this.#queueService.previous();
    if (item === null) {
      return null;
    }
    return this.#startItem(item);
  }

  pause(): Promise<void> {
    return this.#player.pause();
  }

  resume(): Promise<void> {
    return this.#player.resume();
  }

  stop(): Promise<void> {
    return this.#player.stop();
  }

  seekTo(positionSeconds: number): Promise<void> {
    return this.#player.seekTo(positionSeconds);
  }

  setVolume(volume: number): Promise<void> {
    return this.#player.setVolume(volume);
  }

  /** Current playback state combined with queue position. */
  async now(): Promise<NowPlaying> {
    const snapshot = await this.#player.getSnapshot();
    const queue = this.#queueService.getQueue();
    const item = this.#queueService.current();
    return {
      snapshot,
      item,
      position: queue.currentIndex + 1,
      total: queue.items.length,
      shuffle: queue.shuffle,
      repeat: queue.repeat,
    };
  }

  /** Releases the player backend and stops auto-advance listening. */
  async dispose(): Promise<void> {
    this.#unsubscribe();
    await this.#player.dispose();
  }

  /** Resolves the stream, starts the backend, and records history. */
  async #startItem(item: QueueItem): Promise<Track> {
    const stream = await this.#streamResolver.resolve(item.track.id);
    await this.#player.play({ track: item.track, streamUrl: stream.url });
    this.#historyStore.append({
      track: item.track,
      playedAt: this.#now().toISOString(),
    });
    this.#logger?.debug({ trackId: item.track.id, title: item.track.title }, 'playback started');
    return item.track;
  }

  /** Handles a naturally ending track by advancing the queue once. */
  #onTrackEnded(): void {
    if (this.#advancing !== null) {
      return;
    }
    this.#advancing = this.#advance()
      .catch((error: unknown) => {
        this.#logger?.warn({ err: error }, 'auto-advance failed');
      })
      .finally(() => {
        this.#advancing = null;
      });
  }

  /** Moves to the next queued track, if any, and starts it. */
  async #advance(): Promise<void> {
    const item = this.#queueService.next();
    if (item === null) {
      return;
    }
    await this.#startItem(item);
  }
}
