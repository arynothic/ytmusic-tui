import { createConnection, createServer, type Socket } from 'node:net';

import { PlayerError } from '@/core/errors';

/**
 * Minimal client for VLC's remote-control (`-I rc --rc-host`) text
 * interface. VLC is started with `--rc-quiet`, so the wire is plain
 * newline-delimited request/response with no banner or prompt.
 */
export interface VlcRcConnection {
  /** Sends a command line, ignoring any output it produces. */
  send(command: string): Promise<void>;
  /** Sends a command and resolves with the first non-empty response line. */
  query(command: string): Promise<string>;
  /** Registers a handler invoked when the socket closes. */
  onClose(handler: () => void): void;
  /** Closes the socket. */
  close(): void;
}

/** Options for {@link connectVlcRc}. */
export interface ConnectVlcRcOptions {
  /** Per-query reply timeout in milliseconds. Defaults to 2000. */
  readonly queryTimeoutMs?: number;
}

/** Lines VLC may emit that are never answers to a query. */
const NOISE_PATTERN = /^>|^VLC media player|^Command Line Interface|^Type .help/i;

/** Connects to a running VLC RC TCP interface. */
export function connectVlcRc(
  address: { readonly host: string; readonly port: number },
  options: ConnectVlcRcOptions = {},
): Promise<VlcRcConnection> {
  const queryTimeoutMs = options.queryTimeoutMs ?? 2000;

  return new Promise((resolve, reject) => {
    const socket: Socket = createConnection({ host: address.host, port: address.port });
    let buffer = '';
    let connected = false;
    const waiters: { resolve: (line: string) => void; timer: NodeJS.Timeout }[] = [];
    const closeHandlers: (() => void)[] = [];

    const failWaiters = (): void => {
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve('');
      }
    };

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        // Without --rc-quiet, VLC prefixes output with its "> " prompt,
        // which can merge into a response line when it was buffered.
        const withoutPrompt = line.startsWith('> ') ? line.slice(2) : line;
        const trimmed = withoutPrompt.trim();
        if (trimmed === '' || NOISE_PATTERN.test(trimmed)) {
          continue;
        }
        const waiter = waiters.shift();
        if (waiter !== undefined) {
          clearTimeout(waiter.timer);
          waiter.resolve(trimmed);
        }
      }
    });

    socket.on('error', (error: Error) => {
      if (!connected) {
        reject(
          new PlayerError('PLAYER_SPAWN_FAILED', `Cannot reach VLC RC socket: ${error.message}`, {
            cause: error,
          }),
        );
        return;
      }
      failWaiters();
    });

    socket.on('close', () => {
      failWaiters();
      for (const handler of closeHandlers) {
        handler();
      }
    });

    socket.on('connect', () => {
      connected = true;
      resolve({
        send(command: string): Promise<void> {
          if (socket.destroyed) {
            return Promise.reject(new PlayerError('PLAYER_IPC_ERROR', 'VLC RC socket is closed'));
          }
          socket.write(`${command}\n`);
          return Promise.resolve();
        },
        query(command: string): Promise<string> {
          if (socket.destroyed) {
            return Promise.reject(new PlayerError('PLAYER_IPC_ERROR', 'VLC RC socket is closed'));
          }
          return new Promise((resolveQuery) => {
            const timer = setTimeout(() => {
              const index = waiters.findIndex((waiter) => waiter.timer === timer);
              if (index !== -1) {
                waiters.splice(index, 1);
              }
              resolveQuery('');
            }, queryTimeoutMs);
            waiters.push({ resolve: resolveQuery, timer });
            socket.write(`${command}\n`);
          });
        },
        onClose(handler: () => void): void {
          closeHandlers.push(handler);
        },
        close(): void {
          socket.destroy();
        },
      });
    });
  });
}

/**
 * Picks an ephemeral free TCP port by briefly binding port 0. There is an
 * inherent race before VLC binds it, acceptable for a local fallback.
 */
export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new PlayerError('PLAYER_SPAWN_FAILED', 'Could not allocate a port for VLC RC'));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}
