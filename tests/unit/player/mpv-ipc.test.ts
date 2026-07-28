import { createServer, type Server, type Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayerError } from '@/core/errors';
import { connectMpvIpc, type MpvIpcConnection } from '@/player/mpv-ipc';

/** A scripted TCP server standing in for mpv's IPC socket. */
interface FakeMpvServer {
  readonly address: { host: string; port: number };
  readonly received: Record<string, unknown>[];
  readonly server: Server;
  respond(message: Record<string, unknown>): void;
  pushRaw(line: string): void;
  close(): Promise<void>;
}

/** Starts a JSON-lines server; replies are driven manually per test. */
function startFakeMpv(
  autoReply?: (message: Record<string, unknown>) => Record<string, unknown> | undefined,
): Promise<FakeMpvServer> {
  const received: Record<string, unknown>[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') {
          continue;
        }
        const message = JSON.parse(line) as Record<string, unknown>;
        received.push(message);
        const reply = autoReply?.(message);
        if (reply !== undefined) {
          socket.write(`${JSON.stringify(reply)}\n`);
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addressInfo = server.address();
      if (addressInfo === null || typeof addressInfo === 'string') {
        throw new Error('test server has no address');
      }
      const firstSocket = (): Socket => {
        const socket = [...sockets][0];
        if (socket === undefined) {
          throw new Error('no client connected yet');
        }
        return socket;
      };
      resolve({
        address: { host: '127.0.0.1', port: addressInfo.port },
        received,
        server,
        respond: (message) => {
          firstSocket().write(`${JSON.stringify(message)}\n`);
        },
        pushRaw: (line) => {
          firstSocket().write(`${line}\n`);
        },
        close: () =>
          new Promise<void>((done) => {
            for (const socket of sockets) {
              socket.destroy();
            }
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

describe('connectMpvIpc', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
      await cleanup();
    }
  });

  it('sends commands with request ids and resolves with reply data', async () => {
    const fake = await startFakeMpv((message) => ({
      request_id: message['request_id'],
      error: 'success',
      data: 42,
    }));
    cleanups.push(fake.close);
    const connection = await connectMpvIpc(fake.address);

    const data = await connection.request(['get_property', 'volume']);
    expect(data).toBe(42);
    expect(fake.received[0]).toEqual({ command: ['get_property', 'volume'], request_id: 1 });
    connection.close();
  });

  it('correlates out-of-order replies by request_id', async () => {
    const fake = await startFakeMpv();
    cleanups.push(fake.close);
    const connection = await connectMpvIpc(fake.address);

    const first = connection.request(['get_property', 'time-pos']);
    const second = connection.request(['get_property', 'volume']);
    fake.respond({ request_id: 2, error: 'success', data: 75 });
    fake.respond({ request_id: 1, error: 'success', data: 12 });
    await expect(first).resolves.toBe(12);
    await expect(second).resolves.toBe(75);
    connection.close();
  });

  it('rejects with PlayerError when mpv reports a command error', async () => {
    const fake = await startFakeMpv((message) => ({
      request_id: message['request_id'],
      error: 'property unavailable',
    }));
    cleanups.push(fake.close);
    const connection = await connectMpvIpc(fake.address);

    await expect(connection.request(['get_property', 'nope'])).rejects.toBeInstanceOf(PlayerError);
    connection.close();
  });

  it('dispatches unsolicited events and ignores malformed lines', async () => {
    const fake = await startFakeMpv();
    cleanups.push(fake.close);
    const connection: MpvIpcConnection = await connectMpvIpc(fake.address);
    const events: Record<string, unknown>[] = [];
    connection.onEvent((event) => {
      events.push(event);
    });

    fake.pushRaw('not json at all');
    fake.respond({ event: 'property-change', id: 1, name: 'pause', data: true });
    fake.respond({ event: 'end-file', reason: 'eof' });
    await vi.waitFor(() => {
      expect(events).toHaveLength(2);
    });
    expect(events[0]?.['name']).toBe('pause');
    connection.close();
  });

  it('rejects pending requests when the socket closes', async () => {
    const fake = await startFakeMpv();
    cleanups.push(fake.close);
    const connection = await connectMpvIpc(fake.address);

    const pending = connection.request(['get_property', 'time-pos']);
    await fake.close();
    await expect(pending).rejects.toBeInstanceOf(PlayerError);
  });

  it('rejects the connection when nothing listens', async () => {
    await expect(connectMpvIpc({ host: '127.0.0.1', port: 1 })).rejects.toBeInstanceOf(PlayerError);
  });
});
