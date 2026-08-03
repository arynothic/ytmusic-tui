import { createServer, type Server, type Socket } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlayerError } from '@/core/errors';
import { connectVlcRc, pickFreePort, type VlcRcConnection } from '@/player/vlc-rc';

/** A scripted TCP server standing in for VLC's RC interface. */
interface FakeVlcServer {
  readonly address: { host: string; port: number };
  readonly received: string[];
  close(): Promise<void>;
}

/** Starts a line-based RC server; queries get the configured reply. */
function startFakeVlc(options: { reply?: string; banner?: boolean } = {}): Promise<FakeVlcServer> {
  const received: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    if (options.banner === true) {
      socket.write('VLC media player 3.0.20\nCommand Line Interface initialized.\r\n> ');
    }
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') {
          continue;
        }
        received.push(trimmed);
        if (options.reply !== undefined) {
          socket.write(`${options.reply}\n`);
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
      resolve({
        address: { host: '127.0.0.1', port: addressInfo.port },
        received,
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

describe('connectVlcRc', () => {
  const cleanups: (() => Promise<void>)[] = [];
  let connection: VlcRcConnection | undefined;

  afterEach(async () => {
    connection?.close();
    connection = undefined;
    for (const cleanup of cleanups.splice(0)) {
      await cleanup();
    }
  });

  it('sends commands and answers queries with the first response line', async () => {
    const fake = await startFakeVlc({ reply: '83' });
    cleanups.push(fake.close);
    connection = await connectVlcRc(fake.address);

    await connection.send('pause');
    await expect(connection.query('get_time')).resolves.toBe('83');
    await vi.waitFor(() => {
      expect(fake.received).toEqual(['pause', 'get_time']);
    });
  });

  it('skips banner and prompt noise before answers', async () => {
    const fake = await startFakeVlc({ reply: '1', banner: true });
    cleanups.push(fake.close);
    connection = await connectVlcRc(fake.address);

    await expect(connection.query('is_playing')).resolves.toBe('1');
  });

  it('fires close handlers and resolves pending queries on socket close', async () => {
    const fake = await startFakeVlc();
    cleanups.push(fake.close);
    connection = await connectVlcRc(fake.address);
    const closed = vi.fn();
    connection.onClose(closed);

    const pending = connection.query('get_time');
    await fake.close();
    await expect(pending).resolves.toBe('');
    await vi.waitFor(() => {
      expect(closed).toHaveBeenCalledOnce();
    });
    connection = undefined;
  });

  it('rejects when nothing listens', async () => {
    await expect(connectVlcRc({ host: '127.0.0.1', port: 1 })).rejects.toBeInstanceOf(PlayerError);
  });
});

describe('pickFreePort', () => {
  it('returns a bindable port', async () => {
    const port = await pickFreePort();
    expect(port).toBeGreaterThan(0);
    // The port really is free: we can bind it right away.
    const server: Server = createServer();
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(port, '127.0.0.1', () => {
        resolveListen();
      });
    });
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
    });
  });
});
