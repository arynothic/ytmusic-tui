import { spawn } from 'node:child_process';

import type { Logger } from 'pino';

import { PlayerError } from '@/core/errors';
import type {
  PlayRequest,
  PlayerBackend,
  PlayerCapabilities,
  PlayerSnapshot,
  PlayerStateListener,
} from '@/core/ports';
import { connectVlcRc, pickFreePort, type VlcRcConnection } from '@/player/vlc-rc';
import { sleep as defaultSleep } from '@/utils';

/** Narrow view of the spawned VLC child process (injectable for tests). */
export interface VlcProcessHandle {
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  kill(signal?: NodeJS.Signals | number): void;
}

/** Spawns a VLC process; defaults to `node:child_process.spawn`. */
export type VlcSpawner = (binary: string, args: readonly string[]) => VlcProcessHandle;

/** Connects to the VLC RC socket; defaults to {@link connectVlcRc}. */
export type VlcRcConnector = (address: {
  readonly host: string;
  readonly port: number;
}) => Promise<VlcRcConnection>;

/** Registers a repeating callback; returns a cancel function. */
export type PollerFactory = (callback: () => void, intervalMs: number) => () => void;

/** Options for {@link VlcPlayerBackend}. */
export interface VlcPlayerBackendOptions {
  /** Absolute path to the vlc (or cvlc) binary. */
  readonly binary: string;
  /** Initial volume 0-100. Defaults to 80. */
  readonly volume?: number;
  readonly spawner?: VlcSpawner;
  readonly connector?: VlcRcConnector;
  /** Free-port picker for the RC interface; injectable for tests. */
  readonly pickPort?: () => Promise<number>;
  /** Position poll interval; 0 disables polling. Defaults to 500. */
  readonly positionPollMs?: number;
  /** Interval factory, injectable for tests. */
  readonly poller?: PollerFactory;
  /** How long to wait for VLC to open its RC socket. Defaults to 8000. */
  readonly spawnTimeoutMs?: number;
  /** Sleep implementation, injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly logger?: Logger;
}

/** VLC's RC `volume` command takes 0-256; ours is 0-100. */
const VLC_VOLUME_SCALE = 256 / 100;

/** Default spawner: detached + unref'd so the CLI may exit mid-track. */
const defaultSpawner: VlcSpawner = (binary, args) => {
  const child = spawn(binary, [...args], { stdio: 'ignore', detached: true });
  child.unref();
  return child;
};

const defaultPoller: PollerFactory = (callback, intervalMs) => {
  const timer = setInterval(callback, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
};

/** Clamps a number to the 0-100 volume range. */
function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)));
}

/**
 * PlayerBackend driving VLC through its remote-control TCP interface.
 * VLC has no persistent idle mode suitable here, so every `play()` runs a
 * fresh `--play-and-exit` process; the process exiting signals the end of
 * the track. Position is polled over RC while playing.
 */
export class VlcPlayerBackend implements PlayerBackend {
  readonly name = 'vlc';
  readonly capabilities: PlayerCapabilities = {
    canSeek: true,
    canSetVolume: true,
    reportsPosition: true,
  };

  readonly #binary: string;
  readonly #spawner: VlcSpawner;
  readonly #connector: VlcRcConnector;
  readonly #pickPort: () => Promise<number>;
  readonly #positionPollMs: number;
  readonly #poller: PollerFactory;
  readonly #spawnTimeoutMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #logger: Logger | undefined;

  #process: VlcProcessHandle | undefined;
  #connection: VlcRcConnection | undefined;
  #cancelPoll: (() => void) | undefined;
  /** Processes killed by us (stop/dispose/track-switch), not natural ends. */
  readonly #intentionalKills = new WeakSet<VlcProcessHandle>();
  #snapshot: PlayerSnapshot;
  readonly #listeners = new Set<PlayerStateListener>();

  constructor(options: VlcPlayerBackendOptions) {
    this.#binary = options.binary;
    this.#spawner = options.spawner ?? defaultSpawner;
    this.#connector = options.connector ?? ((address) => connectVlcRc(address));
    this.#pickPort = options.pickPort ?? pickFreePort;
    this.#positionPollMs = options.positionPollMs ?? 500;
    this.#poller = options.poller ?? defaultPoller;
    this.#spawnTimeoutMs = options.spawnTimeoutMs ?? 8000;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#logger = options.logger;
    this.#snapshot = {
      status: 'idle',
      track: null,
      positionSeconds: 0,
      volume: clampVolume(options.volume ?? 80),
    };
  }

  async play(request: PlayRequest): Promise<void> {
    this.#teardownProcess();
    const port = await this.#pickPort();
    const args = [
      '-I',
      'rc',
      '--rc-host',
      `127.0.0.1:${String(port)}`,
      '--rc-quiet',
      '--no-video',
      '--play-and-exit',
      `--volume=${String(Math.round(this.#snapshot.volume * VLC_VOLUME_SCALE))}`,
      request.streamUrl,
    ];
    let processHandle: VlcProcessHandle;
    try {
      processHandle = this.#spawner(this.#binary, args);
    } catch (error) {
      throw new PlayerError('PLAYER_SPAWN_FAILED', `Failed to start VLC: ${describe(error)}`, {
        cause: error,
      });
    }

    let exited = false;
    processHandle.on('error', () => {
      exited = true;
    });
    processHandle.on('exit', () => {
      this.#handleExit(processHandle);
    });
    this.#process = processHandle;

    const connection = await this.#awaitRc(port, processHandle, () => exited);
    this.#connection = connection;
    connection.onClose(() => {
      this.#handleExit(processHandle);
    });

    if (request.startPositionSeconds !== undefined && request.startPositionSeconds > 0) {
      await connection.send(`seek ${String(Math.round(request.startPositionSeconds))}`);
    }
    this.#snapshot = {
      ...this.#snapshot,
      status: 'playing',
      track: request.track,
      positionSeconds: Math.round(request.startPositionSeconds ?? 0),
    };
    this.#emit();
    this.#startPolling();
  }

  async pause(): Promise<void> {
    const connection = this.#requireConnection('pause');
    await connection.send('pause');
    this.#setSnapshot({ status: 'paused' });
  }

  async resume(): Promise<void> {
    const connection = this.#requireConnection('resume');
    await connection.send('pause');
    this.#setSnapshot({ status: 'playing' });
  }

  async stop(): Promise<void> {
    const connection = this.#connection;
    if (connection !== undefined) {
      await connection.send('stop');
    }
    this.#setSnapshot({ status: 'stopped', track: null, positionSeconds: 0 });
    this.#teardownProcess();
  }

  async seekTo(positionSeconds: number): Promise<void> {
    const connection = this.#requireConnection('seek');
    const position = Math.max(0, Math.round(positionSeconds));
    await connection.send(`seek ${String(position)}`);
    this.#setSnapshot({ positionSeconds: position });
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = clampVolume(volume);
    const connection = this.#connection;
    if (connection !== undefined) {
      await connection.send(`volume ${String(Math.round(clamped * VLC_VOLUME_SCALE))}`);
    }
    this.#setSnapshot({ volume: clamped });
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
    this.#teardownProcess();
    this.#setSnapshot({ status: 'idle', track: null, positionSeconds: 0 });
    return Promise.resolve();
  }

  /** Waits until VLC's RC socket accepts connections. */
  async #awaitRc(
    port: number,
    processHandle: VlcProcessHandle,
    exited: () => boolean,
  ): Promise<VlcRcConnection> {
    const deadline = Date.now() + this.#spawnTimeoutMs;
    for (;;) {
      try {
        return await this.#connector({ host: '127.0.0.1', port });
      } catch (error) {
        if (exited() || Date.now() >= deadline) {
          processHandle.kill('SIGKILL');
          if (this.#process === processHandle) {
            this.#process = undefined;
          }
          throw new PlayerError('PLAYER_SPAWN_FAILED', 'VLC did not open its RC socket in time', {
            cause: error,
          });
        }
        await this.#sleep(50);
      }
    }
  }

  /** Starts polling `get_time` to keep the position fresh. */
  #startPolling(): void {
    this.#cancelPoll?.();
    if (this.#positionPollMs <= 0) {
      return;
    }
    this.#cancelPoll = this.#poller(() => {
      void this.#pollOnce();
    }, this.#positionPollMs);
  }

  /** One position poll; failures are ignored (process may have exited). */
  async #pollOnce(): Promise<void> {
    const connection = this.#connection;
    if (connection === undefined || this.#snapshot.status !== 'playing') {
      return;
    }
    try {
      const answer = await connection.query('get_time');
      const seconds = Number.parseInt(answer, 10);
      if (!Number.isNaN(seconds)) {
        this.#setSnapshot({ positionSeconds: seconds });
      }
    } catch (error) {
      this.#logger?.debug({ err: error }, 'VLC position poll failed');
    }
  }

  /** Handles VLC exiting (natural track end vs. our own teardown). */
  #handleExit(processHandle: VlcProcessHandle): void {
    if (this.#process !== processHandle) {
      return;
    }
    const intentional = this.#intentionalKills.has(processHandle);
    this.#cancelPoll?.();
    this.#cancelPoll = undefined;
    this.#connection?.close();
    this.#connection = undefined;
    this.#process = undefined;
    this.#intentionalKills.delete(processHandle);
    if (!intentional) {
      // Natural exit under --play-and-exit: the track finished.
      this.#setSnapshot({ status: 'idle', track: null, positionSeconds: 0 });
    }
  }

  /** Kills the current process and closes the RC connection, if any. */
  #teardownProcess(): void {
    this.#cancelPoll?.();
    this.#cancelPoll = undefined;
    this.#connection?.close();
    this.#connection = undefined;
    if (this.#process !== undefined) {
      this.#intentionalKills.add(this.#process);
      this.#process.kill('SIGTERM');
      this.#process = undefined;
    }
  }

  /** Returns the live connection or raises PLAYER_NO_ACTIVE_SESSION. */
  #requireConnection(action: string): VlcRcConnection {
    if (this.#connection === undefined) {
      throw new PlayerError('PLAYER_NO_ACTIVE_SESSION', `Cannot ${action}: nothing is playing`);
    }
    return this.#connection;
  }

  /** Merges a partial update into the snapshot and notifies listeners. */
  #setSnapshot(patch: Partial<PlayerSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#emit();
  }

  /** Notifies all state listeners, isolating their failures. */
  #emit(): void {
    for (const listener of this.#listeners) {
      try {
        listener(this.#snapshot);
      } catch (error) {
        this.#logger?.warn({ err: error }, 'player state listener threw');
      }
    }
  }
}

/** Describes an unknown thrown value for error messages. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
