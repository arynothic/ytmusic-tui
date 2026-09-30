import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Logger } from 'pino';
import { z } from 'zod';

import { StreamError } from '@/core/errors';
import type { CacheStore, StreamResolver } from '@/core/ports';
import { ResolvedStreamSchema, type ResolvedStream, type VideoId } from '@/models';
import { findExecutable, runCommand, type CommandResult } from '@/utils';

/** Cached URLs closer to expiry than this are re-resolved. */
const EXPIRY_MARGIN_MS = 60_000;
/** Fallback URL lifetime when yt-dlp reports no expiry (~6h real-world). */
const FALLBACK_URL_TTL_MS = 6 * 60 * 60 * 1000;
/** yt-dlp invocation timeout. */
const RESOLVE_TIMEOUT_MS = 30_000;

/** Options for {@link YtDlpStreamResolver}. */
export interface YtDlpStreamResolverOptions {
  readonly cacheStore: CacheStore;
  /** Cache TTL for resolved URLs in milliseconds. */
  readonly streamTtlMs: number;
  /** Explicit yt-dlp binary path; skips PATH lookup. */
  readonly ytDlpPath?: string;
  /**
   * Browser whose existing session yt-dlp should reuse
   * (`--cookies-from-browser`), e.g. "chrome" or "firefox".
   */
  readonly cookiesFrom?: string;
  /**
   * Supplies the *content* of a Netscape cookies.txt to pass via
   * `--cookies`, used when no browser is configured but a login is stored.
   * Content (not a path) keeps cookie parsing out of this module.
   */
  readonly cookieProvider?: () => Promise<string | undefined>;
  /** Command runner, injectable for tests. */
  readonly run?: typeof runCommand;
  /** Executable locator, injectable for tests. */
  readonly findExec?: typeof findExecutable;
  readonly logger?: Logger;
  /** Clock, injectable for tests. */
  readonly now?: () => number;
}

const YtDlpInfoSchema = z.object({
  url: z.string().optional(),
  ext: z.string().optional(),
  abr: z.number().optional(),
  acodec: z.string().optional(),
});

/**
 * StreamResolver backed by yt-dlp. Resolved URLs (with their expiry)
 * are cached in the CacheStore so repeated playback of the same track
 * does not re-spawn yt-dlp.
 */
export class YtDlpStreamResolver implements StreamResolver {
  readonly #cache: CacheStore;
  readonly #streamTtlMs: number;
  readonly #ytDlpPath: string | undefined;
  readonly #cookiesFrom: string | undefined;
  readonly #cookieProvider: (() => Promise<string | undefined>) | undefined;
  readonly #run: typeof runCommand;
  readonly #findExec: typeof findExecutable;
  readonly #logger: Logger | undefined;
  readonly #now: () => number;

  constructor(options: YtDlpStreamResolverOptions) {
    this.#cache = options.cacheStore;
    this.#streamTtlMs = options.streamTtlMs;
    this.#ytDlpPath = options.ytDlpPath;
    this.#cookiesFrom = options.cookiesFrom;
    this.#cookieProvider = options.cookieProvider;
    this.#run = options.run ?? runCommand;
    this.#findExec = options.findExec ?? findExecutable;
    this.#logger = options.logger;
    this.#now = options.now ?? Date.now;
  }

  async resolve(trackId: VideoId): Promise<ResolvedStream> {
    const cacheKey = `stream:${trackId}`;
    const cached = this.#cache.get(cacheKey, ResolvedStreamSchema);
    if (cached !== undefined && cached.expiresAt > this.#now() + EXPIRY_MARGIN_MS) {
      return cached;
    }

    const binary = await this.#resolveBinary();
    const watchUrl = `https://music.youtube.com/watch?v=${trackId}`;
    const { args: authArgs, cleanup } = await this.#authArgs();
    let result: CommandResult;
    try {
      result = await this.#run(
        binary,
        ['-f', 'bestaudio', '-j', '--no-playlist', ...authArgs, '--', watchUrl],
        { timeoutMs: RESOLVE_TIMEOUT_MS },
      );
    } finally {
      await cleanup();
    }

    if (result.killed) {
      throw new StreamError(
        'STREAM_RESOLVE_FAILED',
        `yt-dlp timed out while resolving "${trackId}"`,
      );
    }
    if (result.code !== 0) {
      throw new StreamError('STREAM_RESOLVE_FAILED', failureMessage(trackId, result.stderr));
    }

    const stream = this.#parseOutput(trackId, result.stdout);
    this.#cache.set(cacheKey, stream, this.#streamTtlMs);
    this.#logger?.debug({ trackId }, 'resolved stream URL via yt-dlp');
    return stream;
  }

  /**
   * Builds the cookie arguments for yt-dlp. Prefers a browser session
   * (`--cookies-from-browser`) so nothing has to be pasted; otherwise
   * falls back to a stored login, exported to a temporary `0600` file.
   */
  async #authArgs(): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
    if (this.#cookiesFrom !== undefined && this.#cookiesFrom !== '') {
      return { args: ['--cookies-from-browser', this.#cookiesFrom], cleanup: noop };
    }
    if (this.#cookieProvider === undefined) {
      return { args: [], cleanup: noop };
    }
    const content = await this.#cookieProvider().catch(() => undefined);
    if (content === undefined || content.trim() === '') {
      return { args: [], cleanup: noop };
    }
    const file = join(
      tmpdir(),
      `ytmusic-cookies-${String(process.pid)}-${Math.random().toString(36).slice(2, 8)}.txt`,
    );
    await writeFile(file, content, { encoding: 'utf8', mode: 0o600 });
    return {
      args: ['--cookies', file],
      cleanup: () => rm(file, { force: true }).catch(noop),
    };
  }

  async #resolveBinary(): Promise<string> {
    if (this.#ytDlpPath !== undefined) {
      return this.#ytDlpPath;
    }
    const found = await this.#findExec('yt-dlp');
    if (found === undefined) {
      throw new StreamError(
        'STREAM_RESOLVER_MISSING',
        'yt-dlp is required for playback but was not found on PATH. ' +
          'Install it: https://github.com/yt-dlp/yt-dlp#installation',
      );
    }
    return found;
  }

  #parseOutput(trackId: VideoId, stdout: string): ResolvedStream {
    let info: unknown;
    try {
      info = JSON.parse(stdout);
    } catch (error) {
      throw new StreamError(
        'STREAM_RESOLVE_FAILED',
        `yt-dlp returned unparseable output for "${trackId}"`,
        { cause: error },
      );
    }
    const parsed = YtDlpInfoSchema.safeParse(info);
    if (!parsed.success || parsed.data.url === undefined) {
      throw new StreamError(
        'STREAM_RESOLVE_FAILED',
        `yt-dlp returned no playable URL for "${trackId}"`,
      );
    }
    const { url, abr, ext, acodec } = parsed.data;
    const expiresAt = readUrlExpiry(url) ?? this.#now() + FALLBACK_URL_TTL_MS;
    return ResolvedStreamSchema.parse({
      trackId,
      url,
      expiresAt,
      ...(abr !== undefined ? { bitrateKbps: Math.round(abr) } : {}),
      ...(guessMimeType(ext, acodec) !== undefined ? { mimeType: guessMimeType(ext, acodec) } : {}),
    });
  }
}

/** Reads the `expire` query param (epoch seconds) from a googlevideo URL. */
function readUrlExpiry(url: string): number | undefined {
  try {
    const expire = new URL(url).searchParams.get('expire');
    if (expire === null) {
      return undefined;
    }
    const seconds = Number.parseInt(expire, 10);
    return Number.isNaN(seconds) ? undefined : seconds * 1000;
  } catch {
    return undefined;
  }
}

/** Best-effort MIME type from yt-dlp's ext/acodec fields. */
function guessMimeType(ext: string | undefined, acodec: string | undefined): string | undefined {
  if (ext === 'webm') {
    return 'audio/webm';
  }
  if (ext === 'm4a') {
    return 'audio/mp4';
  }
  if (ext === 'mp3') {
    return 'audio/mpeg';
  }
  if (ext === 'ogg' || ext === 'oga' || ext === 'opus') {
    return 'audio/ogg';
  }
  if (ext === 'flac') {
    return 'audio/flac';
  }
  if (acodec === 'opus') {
    return 'audio/webm';
  }
  return undefined;
}

/** Compresses yt-dlp stderr into a short single-line summary. */
function summarizeStderr(stderr: string): string {
  const lines = stderr
    .trim()
    .split(/\r?\n/)
    .filter((line) => line !== '');
  const summary = lines.slice(-3).join(' | ');
  return summary === '' ? 'unknown error' : summary.slice(0, 300);
}

/** Resolves immediately; used when there is nothing to clean up. */
function noop(): Promise<void> {
  return Promise.resolve();
}

/** True when yt-dlp was blocked by YouTube's "confirm you're not a bot" check. */
function isBotCheck(stderr: string): boolean {
  return /confirm you.?re not a bot|sign in to confirm|not a bot/i.test(stderr);
}

/** Builds an actionable error message from yt-dlp's stderr. */
function failureMessage(trackId: VideoId, stderr: string): string {
  if (isBotCheck(stderr)) {
    return (
      `YouTube blocked playback of "${trackId}" (bot check: "Sign in to confirm you're not a bot"). ` +
      'Log into YouTube in your browser, then run ' +
      '`ytmusic config set youtube.cookiesFrom <chrome|firefox|brave|edge|chromium>` ' +
      'so yt-dlp can reuse that session. Also try updating yt-dlp (`yt-dlp -U`).'
    );
  }
  if (/\b429\b|too many requests/i.test(stderr)) {
    return (
      `yt-dlp was rate limited (HTTP 429) for "${trackId}". ` +
      `Wait a few minutes and retry, or update yt-dlp (\`yt-dlp -U\`). ${summarizeStderr(stderr)}`
    );
  }
  return `yt-dlp failed for "${trackId}": ${summarizeStderr(stderr)}`;
}
