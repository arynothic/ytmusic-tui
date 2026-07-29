import { join } from 'node:path';

import type { Logger } from 'pino';

import { DownloadError } from '@/core/errors';
import type { AppConfig, Track } from '@/models';
import { findExecutable, runCommand } from '@/utils';

/** Options for {@link DownloadService}. */
export interface DownloadServiceOptions {
  /** Target directory for downloaded files. */
  readonly directory: string;
  /** Audio format from configuration. */
  readonly audioFormat: AppConfig['download']['audioFormat'];
  /** Explicit yt-dlp binary path; skips PATH lookup. */
  readonly ytDlpPath?: string;
  /** Command runner, injectable for tests. */
  readonly run?: typeof runCommand;
  /** Executable locator, injectable for tests. */
  readonly findExec?: typeof findExecutable;
  readonly logger?: Logger;
}

/** Outcome of a completed download. */
export interface DownloadResult {
  readonly track: Track;
  /** Absolute path of the final audio file on disk. */
  readonly filePath: string;
}

/** Progress callback receiving 0-100 percentages. */
export type DownloadProgressHandler = (percent: number) => void;

/** Strips characters that are unsafe in file names across platforms. */
function sanitizeFileName(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex -- control chars are stripped deliberately
      .replaceAll(/[\\/:*?"<>|\u0000-\u001f\u007f]/gu, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim()
      .slice(0, 120)
  );
}

/** Compresses yt-dlp stderr into a short single-line summary. */
function summarizeStderr(stderr: string): string {
  const summary = stderr
    .trim()
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .slice(-3)
    .join(' | ');
  return summary === '' ? 'unknown error' : summary.slice(0, 300);
}

/**
 * Downloads tracks as audio files via yt-dlp, embedding metadata and
 * album artwork when the container supports it.
 */
export class DownloadService {
  readonly #directory: string;
  readonly #audioFormat: AppConfig['download']['audioFormat'];
  readonly #ytDlpPath: string | undefined;
  readonly #run: typeof runCommand;
  readonly #findExec: typeof findExecutable;
  readonly #logger: Logger | undefined;

  constructor(options: DownloadServiceOptions) {
    this.#directory = options.directory;
    this.#audioFormat = options.audioFormat;
    this.#ytDlpPath = options.ytDlpPath;
    this.#run = options.run ?? runCommand;
    this.#findExec = options.findExec ?? findExecutable;
    this.#logger = options.logger;
  }

  /**
   * Downloads one track and returns the resulting file path.
   * Progress is parsed from yt-dlp's `--newline` output.
   */
  async download(
    track: Track,
    options: { onProgress?: DownloadProgressHandler } = {},
  ): Promise<DownloadResult> {
    const binary = await this.#resolveBinary();
    const artist = track.artists[0]?.name ?? 'Unknown artist';
    const baseName = sanitizeFileName(`${artist} - ${track.title}`);
    const template = join(this.#directory, `${baseName}.%(ext)s`);
    const watchUrl = `https://music.youtube.com/watch?v=${track.id}`;

    const formatArgs =
      this.#audioFormat === 'bestaudio'
        ? ['-f', 'bestaudio']
        : ['-x', '--audio-format', this.#audioFormat];
    const args = [
      ...formatArgs,
      '--embed-metadata',
      '--embed-thumbnail',
      '--no-playlist',
      '--newline',
      '--print',
      'after_move:filepath',
      '-o',
      template,
      '--',
      watchUrl,
    ];

    let filePath: string | undefined;
    const result = await this.#run(binary, args, {
      timeoutMs: 10 * 60 * 1000,
      onStdoutLine: (line) => {
        const percent = /\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)?.[1];
        if (percent !== undefined) {
          options.onProgress?.(Number.parseFloat(percent));
          return;
        }
        const trimmed = line.trim();
        if (trimmed !== '' && !trimmed.startsWith('[')) {
          filePath = trimmed;
        }
      },
    });

    if (result.killed) {
      throw new DownloadError('DOWNLOAD_FAILED', `Download of "${track.title}" timed out`);
    }
    if (result.code !== 0) {
      throw new DownloadError(
        'DOWNLOAD_FAILED',
        `yt-dlp failed for "${track.title}": ${summarizeStderr(result.stderr)}`,
      );
    }
    if (filePath === undefined) {
      throw new DownloadError(
        'DOWNLOAD_FAILED',
        `yt-dlp did not report an output file for "${track.title}"`,
      );
    }
    this.#logger?.info({ trackId: track.id, filePath }, 'download completed');
    return { track, filePath };
  }

  /** Locates the yt-dlp binary or raises DOWNLOAD_TOOL_MISSING. */
  async #resolveBinary(): Promise<string> {
    if (this.#ytDlpPath !== undefined) {
      return this.#ytDlpPath;
    }
    const found = await this.#findExec('yt-dlp');
    if (found === undefined) {
      throw new DownloadError(
        'DOWNLOAD_TOOL_MISSING',
        'yt-dlp is required for downloads but was not found on PATH. ' +
          'Install it: https://github.com/yt-dlp/yt-dlp#installation',
      );
    }
    return found;
  }
}
