import { createConnection, type Socket } from 'node:net';

import { PlayerError } from '@/core/errors';

/**
 * Target of an mpv IPC connection: a unix socket path (or Windows named
 * pipe), or a TCP endpoint (used by tests and exotic setups).
 */
export type MpvIpcAddress = string | { readonly host: string; readonly port: number };

/** Handler for unsolicited mpv events (property-change, end-file, ...). */
export type MpvEventHandler = (event: Record<string, unknown>) => void;

/**
 * Minimal JSON IPC client for mpv's `--input-ipc-server` socket. Speaks
 * newline-delimited JSON: every request carries a `request_id` that is
 * matched against replies; messages without one are dispatched as events.
 */
export interface MpvIpcConnection {
  /** Sends a command array, resolving with the reply's `data` on success. */
  request(command: readonly unknown[]): Promise<unknown>;
  /** Registers a handler for unsolicited mpv events. */
  onEvent(handler: MpvEventHandler): void;
  /** Closes the socket and rejects pending requests. */
  close(): void;
}

/** Options for {@link connectMpvIpc}. */
export interface ConnectMpvIpcOptions {
  /** Per-request reply timeout in milliseconds. Defaults to 5000. */
  readonly requestTimeoutMs?: number;
}

interface PendingRequest {
  readonly resolve: (data: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

/**
 * Connects to an mpv IPC socket and returns the ready-to-use client.
 * Rejects when the socket cannot be opened.
 */
export function connectMpvIpc(
  address: MpvIpcAddress,
  options: ConnectMpvIpcOptions = {},
): Promise<MpvIpcConnection> {
  const requestTimeoutMs = options.requestTimeoutMs ?? 5000;

  return new Promise((resolve, reject) => {
    const socket: Socket =
      typeof address === 'string' ? createConnection(address) : createConnection(address);

    let buffer = '';
    let nextRequestId = 1;
    let connected = false;
    const pending = new Map<number, PendingRequest>();
    const eventHandlers: MpvEventHandler[] = [];

    const failAll = (error: Error): void => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      pending.clear();
    };

    const dispatch = (message: Record<string, unknown>): void => {
      const requestId = message['request_id'];
      if (typeof requestId === 'number' && pending.has(requestId)) {
        const entry = pending.get(requestId);
        pending.delete(requestId);
        if (entry !== undefined) {
          clearTimeout(entry.timer);
          const errorField = message['error'];
          if (errorField === 'success' || errorField === undefined) {
            entry.resolve(message['data']);
          } else {
            const detail = typeof errorField === 'string' ? errorField : 'unknown error';
            entry.reject(new PlayerError('PLAYER_IPC_ERROR', `mpv command failed: ${detail}`));
          }
        }
        return;
      }
      if (typeof message['event'] === 'string') {
        for (const handler of eventHandlers) {
          handler(message);
        }
      }
    };

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') {
          continue;
        }
        let message: unknown;
        try {
          message = JSON.parse(trimmed);
        } catch {
          continue; // Never let a malformed line kill the connection.
        }
        if (message !== null && typeof message === 'object' && !Array.isArray(message)) {
          dispatch(message as Record<string, unknown>);
        }
      }
    });

    socket.on('error', (error: Error) => {
      if (!connected) {
        reject(
          new PlayerError('PLAYER_SPAWN_FAILED', `Cannot reach mpv IPC socket: ${error.message}`, {
            cause: error,
          }),
        );
        return;
      }
      failAll(
        new PlayerError('PLAYER_IPC_ERROR', `mpv IPC socket error: ${error.message}`, {
          cause: error,
        }),
      );
    });

    socket.on('close', () => {
      failAll(new PlayerError('PLAYER_IPC_ERROR', 'mpv IPC socket closed'));
    });

    socket.on('connect', () => {
      connected = true;
      resolve({
        request(command: readonly unknown[]): Promise<unknown> {
          if (socket.destroyed) {
            return Promise.reject(new PlayerError('PLAYER_IPC_ERROR', 'mpv IPC socket is closed'));
          }
          const requestId = nextRequestId;
          nextRequestId += 1;
          return new Promise((resolveRequest, rejectRequest) => {
            const timer = setTimeout(() => {
              pending.delete(requestId);
              rejectRequest(new PlayerError('PLAYER_IPC_ERROR', 'mpv did not reply in time'));
            }, requestTimeoutMs);
            pending.set(requestId, { resolve: resolveRequest, reject: rejectRequest, timer });
            socket.write(`${JSON.stringify({ command: [...command], request_id: requestId })}\n`);
          });
        },
        onEvent(handler: MpvEventHandler): void {
          eventHandlers.push(handler);
        },
        close(): void {
          failAll(new PlayerError('PLAYER_IPC_ERROR', 'mpv IPC socket closed'));
          socket.destroy();
        },
      });
    });
  });
}
