import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Logger } from 'pino';

import { PlayerError } from '@/core/errors';
import type {
  PlayRequest,
  PlayerBackend,
  PlayerCapabilities,
  PlayerSnapshot,
  PlayerStateListener,
} from '@/core/ports';
import { connectMpvIpc, type MpvIpcAddress, type MpvIpcConnection } from '@/player/mpv-ipc';
import { sleep as defaultSleep } from '@/utils';

/** Narrow view of the spawned mpv child process (injectable for tests). */
export interface MpvProcessHandle {
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  kill(signal?: NodeJS.Signals | number): void;
}

/** Spawns an mpv process; defaults to `node:child_process.spawn`. */
export type MpvSpawner = (binary: string, args: readonly string[]) => MpvProcessHandle;

/** Connects to the mpv IPC socket; defaults to {@link connectMpvIpc}. */
export type MpvConnector = (address: MpvIpcAddress) => Promise<MpvIpcConnection>;

/** Options for {@link MpvPlayerBackend}. */
export interface MpvPlayerBackendOptions {
  /** Absolute path to the mpv binary. */
  readonly binary: string;
  /** Initial volume 0-100. Defaults to 80. */
  readonly volume?: number;
  readonly spawner?: MpvSpawner;
  readonly connector?: MpvConnector;
  /** IPC socket path factory; defaults to a unique path in the OS temp dir. */
  readonly socketPath?: () => string;
  /** How long to wait for mpv to create its IPC socket. Defaults to 5000. */
  readonly spawnTimeoutMs?: number;
  /** Sleep implementation, injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly logger?: Logger;
}

const OBSERVE_PAUSE = 1;
const OBSERVE_TIME_POS = 2;
const OBSERVE_VOLUME = 3;

/** Default spawner: detached from stdio so mpv never touches the terminal. */
const defaultSpawner: MpvSpawner = (binary, args) => spawn(binary, [...args], { stdio: 'ignore' });

/** Builds a unique IPC socket path (named pipe on Windows). */
function defaultSocketPath(): string {
  const unique = `ytmusic-mpv-${String(process.pid)}-${String(Date.now())}`;
  return process.platform === 'win32' ? `\\\\.\\pipe\\${unique}` : join(tmpdir(), `${unique}.sock`);
}

/** Clamps a number to the 0-100 volume range. */
function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)));
}

/**
 * PlayerBackend driving mpv through its JSON IPC socket. The mpv process
 * is started lazily on the first `play()` and kept alive between tracks
 * (`--idle=yes`); property observations keep the snapshot fresh without
 * polling.
 */
export class MpvPlayerBackend implements PlayerBackend {
  readonly name = 'mpv';
  readonly capabilities: PlayerCapabilities = {
    canSeek: true,
    canSetVolume: true,
    reportsPosition: true,
  };

  readonly #binary: string;
  readonly #spawner: MpvSpawner;
  readonly #connector: MpvConnector;
  readonly #socketPath: () => string;
  readonly #spawnTimeoutMs: number;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #logger: Logger | undefined;

  #process: MpvProcessHandle | undefined;
  #connection: MpvIpcConnection | undefined;
  #snapshot: PlayerSnapshot;
  readonly #listeners = new Set<PlayerStateListener>();

  constructor(options: MpvPlayerBackendOptions) {
    this.#binary = options.binary;
    this.#spawner = options.spawner ?? defaultSpawner;
    this.#connector = options.connector ?? ((address) => connectMpvIpc(address));
    this.#socketPath = options.socketPath ?? defaultSocketPath;
    this.#spawnTimeoutMs = options.spawnTimeoutMs ?? 5000;
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
    const connection = await this.#ensureStarted();
    await this.#command(connection, ['loadfile', request.streamUrl], 'load track');
    if (request.startPositionSeconds !== undefined && request.startPositionSeconds > 0) {
      await this.#command(
        connection,
        ['set_property', 'time-pos', Math.round(request.startPositionSeconds)],
        'set start position',
      );
    }
    await this.#command(connection, ['set_property', 'pause', false], 'unpause');
    this.#setSnapshot({
      status: 'playing',
      track: request.track,
      positionSeconds: Math.round(request.startPositionSeconds ?? 0),
    });
  }

  async pause(): Promise<void> {
    const connection = this.#requireConnection('pause');
    await this.#command(connection, ['set_property', 'pause', true], 'pause');
    this.#setSnapshot({ status: 'paused' });
  }

  async resume(): Promise<void> {
    const connection = this.#requireConnection('resume');
    await this.#command(connection, ['set_property', 'pause', false], 'resume');
    this.#setSnapshot({ status: 'playing' });
  }

  async stop(): Promise<void> {
    const connection = this.#connection;
    if (connection !== undefined) {
      await this.#command(connection, ['stop'], 'stop');
    }
    this.#setSnapshot({ status: 'stopped', track: null, positionSeconds: 0 });
  }

  async seekTo(positionSeconds: number): Promise<void> {
    const connection = this.#requireConnection('seek');
    const position = Math.max(0, Math.round(positionSeconds));
    await this.#command(connection, ['set_property', 'time-pos', position], 'seek');
    this.#setSnapshot({ positionSeconds: position });
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = clampVolume(volume);
    const connection = this.#connection;
    if (connection !== undefined) {
      await this.#command(connection, ['set_property', 'volume', clamped], 'set volume');
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

  async dispose(): Promise<void> {
    const connection = this.#connection;
    const processHandle = this.#process;
    this.#connection = undefined;
    this.#process = undefined;
    if (connection !== undefined) {
      try {
        await connection.request(['quit']);
      } catch {
        // mpv may already be gone — disposal must never throw.
      }
      connection.close();
    }
    processHandle?.kill('SIGTERM');
    this.#setSnapshot({ status: 'idle', track: null, positionSeconds: 0 });
  }

  /** Starts mpv and connects to its IPC socket on first use. */
  async #ensureStarted(): Promise<MpvIpcConnection> {
    if (this.#connection !== undefined) {
      return this.#connection;
    }
    const socketPath = this.#socketPath();
    const args = [
      '--idle=yes',
      '--no-video',
      '--really-quiet',
      '--no-terminal',
      `--input-ipc-server=${socketPath}`,
      `--volume=${String(this.#snapshot.volume)}`,
    ];
    let processHandle: MpvProcessHandle;
    try {
      processHandle = this.#spawner(this.#binary, args);
    } catch (error) {
      throw new PlayerError('PLAYER_SPAWN_FAILED', `Failed to start mpv: ${describe(error)}`, {
        cause: error,
      });
    }

    let exited = false;
    processHandle.on('error', () => {
      exited = true;
    });
    this.#process = processHandle;

    const deadline = Date.now() + this.#spawnTimeoutMs;
    for (;;) {
      try {
        const connection = await this.#connector(socketPath);
        this.#attach(connection, processHandle);
        return connection;
      } catch (error) {
        if (exited || Date.now() >= deadline) {
          processHandle.kill('SIGKILL');
          this.#process = undefined;
          throw new PlayerError('PLAYER_SPAWN_FAILED', 'mpv did not open its IPC socket in time', {
            cause: error,
          });
        }
        await this.#sleep(50);
      }
    }
  }

  /** Wires events from a freshly established connection. */
  #attach(connection: MpvIpcConnection, processHandle: MpvProcessHandle): void {
    this.#connection = connection;
    connection.onEvent((event) => {
      this.#handleEvent(event);
    });
    processHandle.on('exit', () => {
      if (this.#process === processHandle) {
        this.#process = undefined;
        this.#connection = undefined;
        this.#setSnapshot({ status: 'idle', track: null, positionSeconds: 0 });
      }
    });
    // Observe the properties that feed the snapshot; failures are not fatal.
    void connection.request(['observe_property', OBSERVE_PAUSE, 'pause']).catch(() => undefined);
    void connection
      .request(['observe_property', OBSERVE_TIME_POS, 'time-pos'])
      .catch(() => undefined);
    void connection.request(['observe_property', OBSERVE_VOLUME, 'volume']).catch(() => undefined);
  }

  /** Applies one unsolicited mpv event to the snapshot. */
  #handleEvent(event: Record<string, unknown>): void {
    if (event['event'] === 'property-change') {
      const id = event['id'];
      if (id === OBSERVE_PAUSE && typeof event['data'] === 'boolean') {
        if (this.#snapshot.track !== null) {
          this.#setSnapshot({ status: event['data'] ? 'paused' : 'playing' });
        }
      } else if (id === OBSERVE_TIME_POS && typeof event['data'] === 'number') {
        this.#setSnapshot({ positionSeconds: Math.round(event['data']) });
      } else if (id === OBSERVE_VOLUME && typeof event['data'] === 'number') {
        this.#setSnapshot({ volume: clampVolume(event['data']) });
      }
      return;
    }
    if (event['event'] === 'end-file') {
      // Natural end of track (or a replaced file): the queue engine
      // listens for this transition to advance.
      this.#setSnapshot({ status: 'idle', track: null, positionSeconds: 0 });
    }
  }

  /** Sends a command, wrapping IPC failures with action context. */
  async #command(
    connection: MpvIpcConnection,
    command: readonly unknown[],
    action: string,
  ): Promise<void> {
    try {
      await connection.request(command);
    } catch (error) {
      if (error instanceof PlayerError) {
        throw new PlayerError(error.code, `Cannot ${action}: ${error.message}`, { cause: error });
      }
      throw new PlayerError('PLAYER_IPC_ERROR', `Cannot ${action}: ${describe(error)}`, {
        cause: error,
      });
    }
  }

  /** Returns the live connection or raises PLAYER_NO_ACTIVE_SESSION. */
  #requireConnection(action: string): MpvIpcConnection {
    if (this.#connection === undefined) {
      throw new PlayerError('PLAYER_NO_ACTIVE_SESSION', `Cannot ${action}: nothing is playing`);
    }
    return this.#connection;
  }

  /** Merges a partial update into the snapshot and notifies listeners. */
  #setSnapshot(patch: Partial<PlayerSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
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
