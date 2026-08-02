import type { Logger } from 'pino';

import { PlayerError } from '@/core/errors';
import type { PlayerBackend } from '@/core/ports';
import type { PlayerBackendPreference } from '@/models';
import { MpvPlayerBackend } from '@/player/mpv-backend';
import { VlcPlayerBackend } from '@/player/vlc-backend';
import { findExecutable } from '@/utils';

/** Options for {@link createPlayerBackend}. */
export interface CreatePlayerBackendOptions {
  /** Preferred backend; "auto" tries mpv first, then VLC. */
  readonly preference: PlayerBackendPreference;
  /** Initial volume 0-100. */
  readonly volume: number;
  /** Explicit mpv binary path; overrides PATH lookup. */
  readonly mpvPath?: string;
  /** Explicit vlc binary path; overrides PATH lookup. */
  readonly vlcPath?: string;
  /**
   * Fixed mpv IPC socket path. Sharing one path across CLI invocations
   * is what lets later commands control an already-playing mpv.
   */
  readonly mpvSocketPath?: string;
  /** Executable locator, injectable for tests. */
  readonly findExec?: typeof findExecutable;
  readonly logger?: Logger;
}

const MPV_INSTALL_HINT = 'Install mpv: https://mpv.io/installation/';
const VLC_INSTALL_HINT = 'Install VLC: https://www.videolan.org/vlc/';

/**
 * Detects an available audio player and constructs its backend. mpv is
 * preferred (rich JSON IPC); VLC is the fallback (RC text interface).
 * Raises PLAYER_NOT_FOUND when the preferred (or any, for "auto") binary
 * cannot be located.
 */
export async function createPlayerBackend(
  options: CreatePlayerBackendOptions,
): Promise<PlayerBackend> {
  const find = options.findExec ?? findExecutable;

  if (options.preference === 'auto' || options.preference === 'mpv') {
    const mpvBinary = options.mpvPath ?? (await find('mpv'));
    if (mpvBinary !== undefined) {
      const socketPath = options.mpvSocketPath;
      return new MpvPlayerBackend({
        binary: mpvBinary,
        volume: options.volume,
        ...(socketPath !== undefined ? { socketPath: () => socketPath } : {}),
        ...(options.logger !== undefined ? { logger: options.logger } : {}),
      });
    }
    if (options.preference === 'mpv') {
      throw new PlayerError(
        'PLAYER_NOT_FOUND',
        `mpv is the configured player backend but was not found on PATH. ${MPV_INSTALL_HINT}`,
      );
    }
  }

  if (options.preference === 'auto' || options.preference === 'vlc') {
    const vlcBinary = options.vlcPath ?? (await find('vlc'));
    if (vlcBinary !== undefined) {
      return new VlcPlayerBackend({
        binary: vlcBinary,
        volume: options.volume,
        ...(options.logger !== undefined ? { logger: options.logger } : {}),
      });
    }
    if (options.preference === 'vlc') {
      throw new PlayerError(
        'PLAYER_NOT_FOUND',
        `VLC is the configured player backend but was not found on PATH. ${VLC_INSTALL_HINT}`,
      );
    }
  }

  throw new PlayerError(
    'PLAYER_NOT_FOUND',
    `No supported audio player found on PATH. ${MPV_INSTALL_HINT} or ${VLC_INSTALL_HINT}`,
  );
}
