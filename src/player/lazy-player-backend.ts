import type {
  PlayRequest,
  PlayerBackend,
  PlayerCapabilities,
  PlayerSnapshot,
  PlayerStateListener,
} from '@/core/ports';

/**
 * PlayerBackend proxy that defers backend detection/creation until the
 * first use. Keeps CLI startup fast and, more importantly, ensures
 * "no player installed" only fails playback commands — never
 * `ytmusic config` or `ytmusic login`.
 */
export class LazyPlayerBackend implements PlayerBackend {
  readonly name = 'lazy';
  readonly capabilities: PlayerCapabilities = {
    canSeek: true,
    canSetVolume: true,
    reportsPosition: true,
  };

  readonly #factory: () => Promise<PlayerBackend>;
  readonly #initialVolume: number;
  /** Listeners and their inner-backend unsubscribe functions once wired. */
  readonly #listeners = new Map<PlayerStateListener, (() => void) | undefined>();
  #backendPromise: Promise<PlayerBackend> | undefined;

  constructor(options: { factory: () => Promise<PlayerBackend>; volume: number }) {
    this.#factory = options.factory;
    this.#initialVolume = options.volume;
  }

  async play(request: PlayRequest): Promise<void> {
    const backend = await this.#backend();
    await backend.play(request);
  }

  async pause(): Promise<void> {
    await (await this.#backend()).pause();
  }

  async resume(): Promise<void> {
    await (await this.#backend()).resume();
  }

  async stop(): Promise<void> {
    await (await this.#backend()).stop();
  }

  async seekTo(positionSeconds: number): Promise<void> {
    await (await this.#backend()).seekTo(positionSeconds);
  }

  async setVolume(volume: number): Promise<void> {
    await (await this.#backend()).setVolume(volume);
  }

  async getSnapshot(): Promise<PlayerSnapshot> {
    // Resolve the real backend so a fresh CLI process can reconnect to a
    // resident player and report its live state. When no player is
    // installed (or detection fails) there is nothing playing.
    try {
      return await (await this.#backend()).getSnapshot();
    } catch {
      return {
        status: 'idle',
        track: null,
        positionSeconds: 0,
        volume: this.#initialVolume,
      };
    }
  }

  onStateChange(listener: PlayerStateListener): () => void {
    if (this.#listeners.has(listener)) {
      return () => undefined;
    }
    this.#listeners.set(listener, undefined);
    this.#wireListener(listener);
    return () => {
      const unsubscribe = this.#listeners.get(listener);
      this.#listeners.delete(listener);
      unsubscribe?.();
    };
  }

  async dispose(): Promise<void> {
    if (this.#backendPromise !== undefined) {
      await (await this.#backend()).dispose();
    }
  }

  /** Resolves (and memoizes) the real backend, then wires all listeners. */
  #backend(): Promise<PlayerBackend> {
    this.#backendPromise ??= this.#factory().then((backend) => {
      for (const listener of this.#listeners.keys()) {
        this.#wireListener(listener);
      }
      return backend;
    });
    return this.#backendPromise;
  }

  /** Subscribes a listener on the real backend once it exists, exactly once. */
  #wireListener(listener: PlayerStateListener): void {
    if (this.#backendPromise === undefined) {
      return;
    }
    void this.#backendPromise.then((backend) => {
      if (this.#listeners.get(listener) === undefined && this.#listeners.has(listener)) {
        this.#listeners.set(listener, backend.onStateChange(listener));
      }
    });
  }
}
