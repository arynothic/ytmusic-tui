import { describe, expect, it } from 'vitest';

import type { PlayerSnapshot } from '@/core/ports';
import { VlcPlayerBackend, type VlcProcessHandle } from '@/player/vlc-backend';
import type { VlcRcConnection } from '@/player/vlc-rc';

import { createTrackFixture } from '../../helpers/fixtures';

/** In-memory VlcRcConnection recording commands. */
class FakeVlcConnection implements VlcRcConnection {
  readonly sent: string[] = [];
  closed = false;
  queryResponder: ((command: string) => string) | undefined;
  readonly #closeHandlers: (() => void)[] = [];

  send(command: string): Promise<void> {
    this.sent.push(command);
    return Promise.resolve();
  }

  query(command: string): Promise<string> {
    this.sent.push(command);
    return Promise.resolve(this.queryResponder?.(command) ?? '');
  }

  onClose(handler: () => void): void {
    this.#closeHandlers.push(handler);
  }

  emitClose(): void {
    for (const handler of this.#closeHandlers) {
      handler();
    }
  }

  close(): void {
    this.closed = true;
  }
}

/** In-memory child process emitting exit events on demand. */
class FakeVlcProcess implements VlcProcessHandle {
  killSignals: (NodeJS.Signals | number)[] = [];
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
    for (const listener of this.#exitListeners) {
      listener(code, null);
    }
  }
}

interface Harness {
  backend: VlcPlayerBackend;
  connection: FakeVlcConnection;
  processes: FakeVlcProcess[];
  spawnCalls: { binary: string; args: readonly string[] }[];
  pollCallback: (() => void) | undefined;
}

/** Flushes pending microtasks so fire-and-forget polls settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** Builds a VLC backend whose process/RC/polling plumbing is fully fake. */
function makeBackend(): Harness {
  const connection = new FakeVlcConnection();
  const processes: FakeVlcProcess[] = [];
  const spawnCalls: { binary: string; args: readonly string[] }[] = [];
  const holder: { pollCallback: (() => void) | undefined } = { pollCallback: undefined };
  const backend = new VlcPlayerBackend({
    binary: '/usr/bin/vlc',
    volume: 50,
    spawner: (binary, args) => {
      spawnCalls.push({ binary, args });
      const process = new FakeVlcProcess();
      processes.push(process);
      return process;
    },
    connector: () => Promise.resolve(connection),
    pickPort: () => Promise.resolve(4212),
    poller: (callback) => {
      holder.pollCallback = callback;
      return () => undefined;
    },
    sleep: () => Promise.resolve(),
  });
  return {
    backend,
    connection,
    processes,
    spawnCalls,
    get pollCallback() {
      return holder.pollCallback;
    },
  };
}

const track = createTrackFixture();
const playRequest = { track, streamUrl: 'https://rr1.googlevideo.com/videoplayback?expire=1' };

describe('VlcPlayerBackend.play', () => {
  it('spawns VLC with RC args and the stream URL', async () => {
    const { backend, spawnCalls } = makeBackend();

    await backend.play(playRequest);

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.binary).toBe('/usr/bin/vlc');
    const args = spawnCalls[0]?.args.join(' ') ?? '';
    expect(args).toContain('--rc-host 127.0.0.1:4212');
    expect(args).toContain('--play-and-exit');
    expect(args).toContain('--volume=128'); // 50% of 256
    expect(args).toContain(playRequest.streamUrl);

    const snapshot = await backend.getSnapshot();
    expect(snapshot.status).toBe('playing');
    expect(snapshot.track?.id).toBe(track.id);
  });

  it('seeks to the start position when provided', async () => {
    const { backend, connection } = makeBackend();

    await backend.play({ ...playRequest, startPositionSeconds: 45 });
    expect(connection.sent).toContain('seek 45');
    expect((await backend.getSnapshot()).positionSeconds).toBe(45);
  });

  it('kills the previous process when a new track starts', async () => {
    const { backend, processes, spawnCalls } = makeBackend();
    await backend.play(playRequest);

    await backend.play(playRequest);
    expect(spawnCalls).toHaveLength(2);
    expect(processes[0]?.killSignals).toContain('SIGTERM');
  });
});

describe('VlcPlayerBackend controls', () => {
  it('toggles pause via RC', async () => {
    const { backend, connection } = makeBackend();
    await backend.play(playRequest);

    await backend.pause();
    expect(connection.sent).toContain('pause');
    expect((await backend.getSnapshot()).status).toBe('paused');

    await backend.resume();
    expect(connection.sent.filter((line) => line === 'pause')).toHaveLength(2);
    expect((await backend.getSnapshot()).status).toBe('playing');
  });

  it('rejects pause/resume/seek without an active session', async () => {
    const { backend } = makeBackend();

    await expect(backend.pause()).rejects.toMatchObject({ code: 'PLAYER_NO_ACTIVE_SESSION' });
    await expect(backend.resume()).rejects.toMatchObject({ code: 'PLAYER_NO_ACTIVE_SESSION' });
    await expect(backend.seekTo(10)).rejects.toMatchObject({ code: 'PLAYER_NO_ACTIVE_SESSION' });
  });

  it('seeks and sets volume through RC', async () => {
    const { backend, connection } = makeBackend();
    await backend.play(playRequest);

    await backend.seekTo(42);
    expect(connection.sent).toContain('seek 42');
    expect((await backend.getSnapshot()).positionSeconds).toBe(42);

    await backend.setVolume(75);
    expect(connection.sent).toContain('volume 192'); // 75% of 256
    expect((await backend.getSnapshot()).volume).toBe(75);
  });

  it('stops playback and tears down the process', async () => {
    const { backend, connection, processes } = makeBackend();
    await backend.play(playRequest);

    await backend.stop();
    expect(connection.sent).toContain('stop');
    expect(processes[0]?.killSignals).toContain('SIGTERM');
    const snapshot = await backend.getSnapshot();
    expect(snapshot.status).toBe('stopped');
    expect(snapshot.track).toBeNull();
  });
});

describe('VlcPlayerBackend position reporting', () => {
  it('polls get_time while playing', async () => {
    const harness = makeBackend();
    harness.connection.queryResponder = (command) => (command === 'get_time' ? '83' : '');
    await harness.backend.play(playRequest);

    harness.pollCallback?.();
    await flushMicrotasks();
    expect(harness.connection.sent).toContain('get_time');
    expect((await harness.backend.getSnapshot()).positionSeconds).toBe(83);
  });

  it('ignores unparseable poll answers', async () => {
    const harness = makeBackend();
    harness.connection.queryResponder = () => '';
    await harness.backend.play(playRequest);

    harness.pollCallback?.();
    await flushMicrotasks();
    expect((await harness.backend.getSnapshot()).positionSeconds).toBe(0);
  });
});

describe('VlcPlayerBackend lifecycle', () => {
  it('goes idle when the VLC process exits (track finished)', async () => {
    const { backend, processes } = makeBackend();
    const snapshots: PlayerSnapshot[] = [];
    backend.onStateChange((snapshot) => {
      snapshots.push(snapshot);
    });
    await backend.play(playRequest);

    processes[0]?.emitExit(0);
    const snapshot = await backend.getSnapshot();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.track).toBeNull();
    expect(snapshots.at(-1)?.status).toBe('idle');
  });

  it('dispose kills the process and resets state', async () => {
    const { backend, processes } = makeBackend();
    await backend.play(playRequest);

    await backend.dispose();
    expect(processes[0]?.killSignals).toContain('SIGTERM');
    expect((await backend.getSnapshot()).status).toBe('idle');
  });
});
