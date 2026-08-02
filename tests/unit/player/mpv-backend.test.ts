import { describe, expect, it } from 'vitest';

import { PlayerError } from '@/core/errors';
import type { PlayerSnapshot } from '@/core/ports';
import { MpvPlayerBackend, type MpvProcessHandle } from '@/player/mpv-backend';
import type { MpvEventHandler, MpvIpcConnection } from '@/player/mpv-ipc';

import { createTrackFixture } from '../../helpers/fixtures';

/** In-memory MpvIpcConnection recording commands and emitting on demand. */
class FakeMpvConnection implements MpvIpcConnection {
  readonly requests: unknown[][] = [];
  closed = false;
  failWith: Error | undefined;
  #handler: MpvEventHandler | undefined;

  request(command: readonly unknown[]): Promise<unknown> {
    this.requests.push([...command]);
    if (this.failWith !== undefined) {
      const error = this.failWith;
      return Promise.reject(error);
    }
    return Promise.resolve(undefined);
  }

  onEvent(handler: MpvEventHandler): void {
    this.#handler = handler;
  }

  emitEvent(event: Record<string, unknown>): void {
    this.#handler?.(event);
  }

  close(): void {
    this.closed = true;
  }
}

/** In-memory child process emitting exit events on demand. */
class FakeMpvProcess implements MpvProcessHandle {
  killSignals: (NodeJS.Signals | number)[] = [];
  /** Mirrors reality: the IPC socket exists only while the process runs. */
  alive = false;
  readonly #exitListeners: ((code: number | null, signal: NodeJS.Signals | null) => void)[] = [];

  on(
    event: 'exit' | 'error',
    listener:
      ((code: number | null, signal: NodeJS.Signals | null) => void) | ((error: Error) => void),
  ): void {
    if (event === 'exit') {
      this.#exitListeners.push(
        listener as (code: number | null, signal: NodeJS.Signals | null) => void,
      );
    }
  }

  kill(signal?: NodeJS.Signals | number): void {
    this.killSignals.push(signal ?? 'SIGTERM');
  }

  emitExit(code = 0): void {
    this.alive = false;
    for (const listener of this.#exitListeners) {
      listener(code, null);
    }
  }
}

interface Harness {
  backend: MpvPlayerBackend;
  connection: FakeMpvConnection;
  process: FakeMpvProcess;
  spawnCalls: { binary: string; args: readonly string[] }[];
}

/**
 * Builds a backend whose spawn/connect plumbing is fully fake.
 * By default the IPC socket "exists" only while the fake process runs,
 * so the backend takes the spawn path; `resident: true` simulates an
 * already-running (foreign) mpv that accepts connections immediately.
 */
function makeBackend(options: { connectError?: Error; resident?: boolean } = {}): Harness {
  const connection = new FakeMpvConnection();
  const process = new FakeMpvProcess();
  const spawnCalls: { binary: string; args: readonly string[] }[] = [];
  const connectError = options.connectError;
  const resident = options.resident === true;
  const connector = (): Promise<FakeMpvConnection> => {
    if (connectError !== undefined) {
      return Promise.reject(connectError);
    }
    if (!resident && !process.alive) {
      return Promise.reject(new Error('ENOENT: no socket'));
    }
    return Promise.resolve(connection);
  };
  const backend = new MpvPlayerBackend({
    binary: '/usr/bin/mpv',
    volume: 70,
    socketPath: () => '/tmp/test-mpv.sock',
    spawner: (binary, args) => {
      spawnCalls.push({ binary, args });
      process.alive = true;
      return process;
    },
    connector,
    spawnTimeoutMs: 60,
    sleep: () => Promise.resolve(),
  });
  return { backend, connection, process, spawnCalls };
}

const track = createTrackFixture();
const playRequest = { track, streamUrl: 'https://rr1.googlevideo.com/videoplayback?expire=1' };

describe('MpvPlayerBackend.play', () => {
  it('spawns mpv with IPC args on first play and loads the stream', async () => {
    const { backend, connection, spawnCalls } = makeBackend();

    await backend.play(playRequest);

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.binary).toBe('/usr/bin/mpv');
    expect(spawnCalls[0]?.args.join(' ')).toContain('--input-ipc-server=/tmp/test-mpv.sock');
    expect(spawnCalls[0]?.args.join(' ')).toContain('--idle=yes');
    expect(spawnCalls[0]?.args.join(' ')).toContain('--volume=70');
    expect(connection.requests).toContainEqual(['loadfile', playRequest.streamUrl]);
    expect(connection.requests).toContainEqual(['set_property', 'pause', false]);

    const snapshot = await backend.getSnapshot();
    expect(snapshot.status).toBe('playing');
    expect(snapshot.track?.id).toBe(track.id);
  });

  it('reuses the running process for subsequent tracks', async () => {
    const { backend, connection, spawnCalls } = makeBackend();

    await backend.play(playRequest);
    await backend.play({ ...playRequest, startPositionSeconds: 30 });

    expect(spawnCalls).toHaveLength(1);
    expect(connection.requests.filter((req) => req[0] === 'loadfile')).toHaveLength(2);
    expect(connection.requests).toContainEqual(['set_property', 'time-pos', 30]);
    expect((await backend.getSnapshot()).positionSeconds).toBe(30);
  });

  it('wraps IPC failures with action context', async () => {
    const { backend, connection } = makeBackend();
    connection.failWith = new PlayerError('PLAYER_IPC_ERROR', 'mpv command failed: core dumped');

    const error = await backend.play(playRequest).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlayerError);
    expect((error as PlayerError).message).toContain('Cannot load track');
  });

  it('raises PLAYER_SPAWN_FAILED when the socket never appears', async () => {
    const { backend } = makeBackend({ connectError: new Error('ENOENT') });

    await expect(backend.play(playRequest)).rejects.toMatchObject({
      code: 'PLAYER_SPAWN_FAILED',
    });
  });

  it('connects to a resident mpv without spawning a new process', async () => {
    const { backend, connection, spawnCalls } = makeBackend({ resident: true });

    await backend.play(playRequest);

    expect(spawnCalls).toHaveLength(0);
    expect(connection.requests).toContainEqual(['loadfile', playRequest.streamUrl]);
    expect((await backend.getSnapshot()).status).toBe('playing');
  });
});

describe('MpvPlayerBackend controls', () => {
  it('pauses and resumes via the pause property', async () => {
    const { backend, connection } = makeBackend();
    await backend.play(playRequest);

    await backend.pause();
    expect(connection.requests).toContainEqual(['set_property', 'pause', true]);
    expect((await backend.getSnapshot()).status).toBe('paused');

    await backend.resume();
    expect((await backend.getSnapshot()).status).toBe('playing');
  });

  it('rejects pause/resume/seek without an active session', async () => {
    const { backend } = makeBackend();

    await expect(backend.pause()).rejects.toMatchObject({ code: 'PLAYER_NO_ACTIVE_SESSION' });
    await expect(backend.resume()).rejects.toMatchObject({ code: 'PLAYER_NO_ACTIVE_SESSION' });
    await expect(backend.seekTo(10)).rejects.toMatchObject({ code: 'PLAYER_NO_ACTIVE_SESSION' });
  });

  it('seeks to an absolute position', async () => {
    const { backend, connection } = makeBackend();
    await backend.play(playRequest);

    await backend.seekTo(42);
    expect(connection.requests).toContainEqual(['set_property', 'time-pos', 42]);
    expect((await backend.getSnapshot()).positionSeconds).toBe(42);
  });

  it('clamps volume and applies it even without a session', async () => {
    const { backend, connection } = makeBackend();

    await backend.setVolume(150);
    expect((await backend.getSnapshot()).volume).toBe(100);
    expect(connection.requests).toHaveLength(0);

    await backend.play(playRequest);
    await backend.setVolume(25);
    expect(connection.requests).toContainEqual(['set_property', 'volume', 25]);
  });

  it('stops playback and clears the track', async () => {
    const { backend, connection } = makeBackend();
    await backend.play(playRequest);

    await backend.stop();
    expect(connection.requests).toContainEqual(['stop']);
    const snapshot = await backend.getSnapshot();
    expect(snapshot.status).toBe('stopped');
    expect(snapshot.track).toBeNull();
  });
});

describe('MpvPlayerBackend events', () => {
  it('updates the snapshot from observed property changes', async () => {
    const { backend, connection } = makeBackend();
    const snapshots: PlayerSnapshot[] = [];
    backend.onStateChange((snapshot) => {
      snapshots.push(snapshot);
    });
    await backend.play(playRequest);

    connection.emitEvent({ event: 'property-change', id: 1, name: 'pause', data: true });
    expect((await backend.getSnapshot()).status).toBe('paused');

    connection.emitEvent({ event: 'property-change', id: 2, name: 'time-pos', data: 61.7 });
    expect((await backend.getSnapshot()).positionSeconds).toBe(62);

    connection.emitEvent({ event: 'property-change', id: 3, name: 'volume', data: 55 });
    expect((await backend.getSnapshot()).volume).toBe(55);

    expect(snapshots.length).toBeGreaterThanOrEqual(4);
  });

  it('goes idle and clears the track on end-file', async () => {
    const { backend, connection } = makeBackend();
    const snapshots: PlayerSnapshot[] = [];
    backend.onStateChange((snapshot) => {
      snapshots.push(snapshot);
    });
    await backend.play(playRequest);

    connection.emitEvent({ event: 'end-file', reason: 'eof' });
    const snapshot = await backend.getSnapshot();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.track).toBeNull();
    expect(snapshots.at(-1)?.status).toBe('idle');
  });

  it('respawns mpv after the process exits', async () => {
    const { backend, process, spawnCalls } = makeBackend();
    await backend.play(playRequest);

    process.emitExit(1);
    expect((await backend.getSnapshot()).status).toBe('idle');

    await backend.play(playRequest);
    expect(spawnCalls).toHaveLength(2);
  });

  it('unsubscribes state listeners', async () => {
    const { backend, connection } = makeBackend();
    const snapshots: PlayerSnapshot[] = [];
    const unsubscribe = backend.onStateChange((snapshot) => {
      snapshots.push(snapshot);
    });
    await backend.play(playRequest);
    unsubscribe();

    connection.emitEvent({ event: 'end-file', reason: 'eof' });
    expect(snapshots).toHaveLength(1);
  });
});

describe('MpvPlayerBackend.dispose', () => {
  it('quits mpv, closes the connection and resets state', async () => {
    const { backend, connection, process } = makeBackend();
    await backend.play(playRequest);

    await backend.dispose();
    expect(connection.requests).toContainEqual(['quit']);
    expect(connection.closed).toBe(true);
    expect(process.killSignals).toContain('SIGTERM');
    expect((await backend.getSnapshot()).status).toBe('idle');
  });

  it('never throws when mpv is already gone', async () => {
    const { backend } = makeBackend();
    await expect(backend.dispose()).resolves.toBeUndefined();
  });
});
