import type {
  PlayRequest,
  PlayerBackend,
  PlayerCapabilities,
  PlayerSnapshot,
  PlayerStateListener,
  PlayerStatus,
} from '@/core/ports';

/** One recorded mutating call on {@link MockPlayerBackend}. */
export interface MockPlayerCall {
  readonly method: 'play' | 'pause' | 'resume' | 'stop' | 'seekTo' | 'setVolume' | 'dispose';
  readonly args: readonly unknown[];
}

/**
 * In-memory PlayerBackend fake. Records every call, keeps a coherent
 * snapshot (play → playing, pause → paused, ...) and lets tests inject
 * failures or simulate events such as the natural end of a track.
 */
export class MockPlayerBackend implements PlayerBackend {
  readonly name = 'mock';
  readonly capabilities: PlayerCapabilities = {
    canSeek: true,
    canSetVolume: true,
    reportsPosition: true,
  };

  readonly calls: MockPlayerCall[] = [];
  /** When set, every mutating method rejects with this error. */
  failWith: Error | undefined;

  #snapshot: PlayerSnapshot;
  readonly #listeners = new Set<PlayerStateListener>();

  constructor(options: { volume?: number } = {}) {
    this.#snapshot = {
      status: 'idle',
      track: null,
      positionSeconds: 0,
      volume: options.volume ?? 80,
    };
  }

  play(request: PlayRequest): Promise<void> {
    this.calls.push({ method: 'play', args: [request] });
    const failure = this.#maybeFail();
    if (failure !== undefined) {
      return failure;
    }
    this.#setSnapshot({
      status: 'playing',
      track: request.track,
      positionSeconds: Math.round(request.startPositionSeconds ?? 0),
    });
    return Promise.resolve();
  }

  pause(): Promise<void> {
    this.calls.push({ method: 'pause', args: [] });
    const failure = this.#maybeFail();
    if (failure !== undefined) {
      return failure;
    }
    this.#setSnapshot({ status: 'paused' });
    return Promise.resolve();
  }

  resume(): Promise<void> {
    this.calls.push({ method: 'resume', args: [] });
    const failure = this.#maybeFail();
    if (failure !== undefined) {
      return failure;
    }
    this.#setSnapshot({ status: 'playing' });
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.calls.push({ method: 'stop', args: [] });
    const failure = this.#maybeFail();
    if (failure !== undefined) {
      return failure;
    }
    this.#setSnapshot({ status: 'stopped', track: null, positionSeconds: 0 });
    return Promise.resolve();
  }

  seekTo(positionSeconds: number): Promise<void> {
    this.calls.push({ method: 'seekTo', args: [positionSeconds] });
    const failure = this.#maybeFail();
    if (failure !== undefined) {
      return failure;
    }
    this.#setSnapshot({ positionSeconds: Math.max(0, Math.round(positionSeconds)) });
    return Promise.resolve();
  }

  setVolume(volume: number): Promise<void> {
    this.calls.push({ method: 'setVolume', args: [volume] });
    const failure = this.#maybeFail();
    if (failure !== undefined) {
      return failure;
    }
    this.#setSnapshot({ volume: Math.min(100, Math.max(0, Math.round(volume))) });
    return Promise.resolve();
  }

  getSnapshot(): Promise<PlayerSnapshot> {
    return Promise.resolve(this.#snapshot);
  }

  onStateChange(listener: PlayerStateListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  dispose(): Promise<void> {
    this.calls.push({ method: 'dispose', args: [] });
    this.#setSnapshot({ status: 'idle', track: null, positionSeconds: 0 });
    return Promise.resolve();
  }

  /** Test helper: pushes an arbitrary snapshot to all listeners. */
  emit(snapshot: Partial<PlayerSnapshot> & { status: PlayerStatus }): void {
    this.#setSnapshot(snapshot);
  }

  /** Test helper: simulates the track finishing naturally. */
  simulateEndOfTrack(): void {
    this.#setSnapshot({ status: 'idle', track: null, positionSeconds: 0 });
  }

  #maybeFail(): Promise<never> | undefined {
    if (this.failWith === undefined) {
      return undefined;
    }
    const error = this.failWith;
    return Promise.reject(error);
  }

  #setSnapshot(patch: Partial<PlayerSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) {
      listener(this.#snapshot);
    }
  }
}
