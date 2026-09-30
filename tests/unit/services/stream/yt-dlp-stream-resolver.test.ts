import { access } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { StreamError } from '@/core/errors';
import { VideoIdSchema, type ResolvedStream } from '@/models';
import { YtDlpStreamResolver } from '@/services/stream';
import type { CommandResult } from '@/utils';

import { MockCacheStore } from '../../../mocks/mock-cache-store';

const TRACK_ID = VideoIdSchema.parse('vid001');
const NOW = 1_000_000_000_000;
/** Fallback URL lifetime mirrors the resolver's ~6h default. */
const FALLBACK_TTL_MS = 6 * 60 * 60 * 1000;

interface ResolverHarness {
  resolver: YtDlpStreamResolver;
  cache: MockCacheStore;
  run: ReturnType<typeof vi.fn>;
  findExec: ReturnType<typeof vi.fn>;
}

/** Creates a resolver with a fixed clock and injectable process fakes. */
function makeResolver(
  runResult: CommandResult,
  options: {
    ytDlpPath?: string;
    findExecReturns?: string;
    cookiesFrom?: string;
    cookieProvider?: () => Promise<string | undefined>;
  } = {},
): ResolverHarness {
  const cache = new MockCacheStore();
  const run = vi.fn(async () => runResult);
  const findExec = vi.fn(async () => options.findExecReturns ?? '/usr/bin/yt-dlp');
  const resolver = new YtDlpStreamResolver({
    cacheStore: cache,
    streamTtlMs: 3_600_000,
    ...(options.ytDlpPath !== undefined ? { ytDlpPath: options.ytDlpPath } : {}),
    ...(options.cookiesFrom !== undefined ? { cookiesFrom: options.cookiesFrom } : {}),
    ...(options.cookieProvider !== undefined ? { cookieProvider: options.cookieProvider } : {}),
    run: run,
    findExec: findExec,
    now: () => NOW,
  });
  return { resolver, cache, run, findExec };
}

/** Successful yt-dlp `-j` output for a googlevideo URL. */
function okResult(
  url = `https://rr1.googlevideo.com/videoplayback?expire=${String((NOW + 3_600_000) / 1000)}&ip=1.2.3.4`,
): CommandResult {
  return {
    code: 0,
    stdout: JSON.stringify({ url, ext: 'webm', abr: 128.4, acodec: 'opus' }),
    stderr: '',
    killed: false,
  };
}

/** Seeds the cache with a stream whose URL expires `expiresInMs` from NOW. */
function seedCache(cache: MockCacheStore, expiresInMs: number): ResolvedStream {
  const stream: ResolvedStream = {
    trackId: TRACK_ID,
    url: 'https://rr1.googlevideo.com/cached',
    expiresAt: NOW + expiresInMs,
  };
  cache.set(`stream:${TRACK_ID}`, stream, 3_600_000);
  return stream;
}

describe('resolve', () => {
  it('runs yt-dlp and parses the JSON info payload', async () => {
    const { resolver, run } = makeResolver(okResult());

    const stream = await resolver.resolve(TRACK_ID);

    expect(run).toHaveBeenCalledWith(
      '/usr/bin/yt-dlp',
      ['-f', 'bestaudio', '-j', '--no-playlist', '--', 'https://music.youtube.com/watch?v=vid001'],
      { timeoutMs: 30_000 },
    );
    expect(stream.trackId).toBe(TRACK_ID);
    expect(stream.url).toContain('googlevideo.com');
    expect(stream.expiresAt).toBe(NOW + 3_600_000);
    expect(stream.bitrateKbps).toBe(128);
    expect(stream.mimeType).toBe('audio/webm');
  });

  it('uses the explicit binary path without searching PATH', async () => {
    const { resolver, run, findExec } = makeResolver(okResult(), { ytDlpPath: '/opt/yt-dlp' });

    await resolver.resolve(TRACK_ID);
    expect(findExec).not.toHaveBeenCalled();
    expect(run.mock.calls[0]?.[0]).toBe('/opt/yt-dlp');
  });

  it('falls back to a ~6h expiry when the URL has no expire param', async () => {
    const { resolver } = makeResolver(okResult('https://rr1.googlevideo.com/plain'));

    const stream = await resolver.resolve(TRACK_ID);
    expect(stream.expiresAt).toBe(NOW + FALLBACK_TTL_MS);
  });

  it('maps known containers to MIME types', async () => {
    const m4a: CommandResult = {
      code: 0,
      stdout: JSON.stringify({ url: 'https://x.googlevideo.com/a', ext: 'm4a' }),
      stderr: '',
      killed: false,
    };
    const { resolver } = makeResolver(m4a);

    const stream = await resolver.resolve(TRACK_ID);
    expect(stream.mimeType).toBe('audio/mp4');
    expect(stream.bitrateKbps).toBeUndefined();
  });

  it.each([
    [{ ext: 'mp3' }, 'audio/mpeg'],
    [{ ext: 'ogg' }, 'audio/ogg'],
    [{ ext: 'oga' }, 'audio/ogg'],
    [{ ext: 'opus' }, 'audio/ogg'],
    [{ ext: 'flac' }, 'audio/flac'],
    [{ ext: 'unknown', acodec: 'opus' }, 'audio/webm'],
    [{ ext: 'unknown', acodec: 'aac' }, undefined],
  ])('maps %j to MIME type %s', async (info, expected) => {
    const result: CommandResult = {
      code: 0,
      stdout: JSON.stringify({ url: 'https://x.googlevideo.com/a', ...info }),
      stderr: '',
      killed: false,
    };
    const { resolver } = makeResolver(result);

    const stream = await resolver.resolve(TRACK_ID);
    expect(stream.mimeType).toBe(expected);
  });
});

describe('cookie authentication', () => {
  it('passes --cookies-from-browser when a browser is configured', async () => {
    const { resolver, run } = makeResolver(okResult(), { cookiesFrom: 'firefox' });

    await resolver.resolve(TRACK_ID);

    expect(run.mock.calls[0]?.[1]).toEqual([
      '-f',
      'bestaudio',
      '-j',
      '--no-playlist',
      '--cookies-from-browser',
      'firefox',
      '--',
      'https://music.youtube.com/watch?v=vid001',
    ]);
  });

  it('uses a stored login via --cookies and deletes the temp file afterwards', async () => {
    const { resolver, run } = makeResolver(okResult(), {
      cookieProvider: () =>
        Promise.resolve('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t9\tSID\tx\n'),
    });

    await resolver.resolve(TRACK_ID);

    const args = run.mock.calls[0]?.[1] as string[];
    const index = args.indexOf('--cookies');
    expect(index).toBeGreaterThan(-1);
    const file = args[index + 1];
    expect(file).toMatch(/ytmusic-cookies-.*\.txt$/u);
    await expect(access(file as string)).rejects.toThrow();
  });

  it('prefers the configured browser over a stored login', async () => {
    const { resolver, run } = makeResolver(okResult(), {
      cookiesFrom: 'brave',
      cookieProvider: () => Promise.resolve('ignored'),
    });

    await resolver.resolve(TRACK_ID);
    expect(run.mock.calls[0]?.[1]).not.toContain('--cookies');
  });
});

describe('cache behavior', () => {
  it('returns a cached URL without re-running yt-dlp', async () => {
    const { resolver, cache, run } = makeResolver(okResult());
    seedCache(cache, 3_600_000);

    const stream = await resolver.resolve(TRACK_ID);
    expect(stream.url).toBe('https://rr1.googlevideo.com/cached');
    expect(run).not.toHaveBeenCalled();
  });

  it('caches freshly resolved URLs for subsequent calls', async () => {
    const { resolver, run } = makeResolver(okResult());

    await resolver.resolve(TRACK_ID);
    const second = await resolver.resolve(TRACK_ID);
    expect(run).toHaveBeenCalledOnce();
    expect(second.url).toContain('googlevideo.com');
  });

  it('re-resolves when the cached URL expires within the safety margin', async () => {
    const { resolver, cache, run } = makeResolver(okResult());
    seedCache(cache, 30_000); // 30s left — inside the 60s margin.

    const stream = await resolver.resolve(TRACK_ID);
    expect(run).toHaveBeenCalledOnce();
    expect(stream.url).not.toBe('https://rr1.googlevideo.com/cached');
  });
});

describe('failure modes', () => {
  it('raises STREAM_RESOLVER_MISSING when yt-dlp is not on PATH', async () => {
    const run = vi.fn();
    const missing = new YtDlpStreamResolver({
      cacheStore: new MockCacheStore(),
      streamTtlMs: 3_600_000,
      run: run as never,
      findExec: vi.fn(async () => undefined),
      now: () => NOW,
    });

    const error = await missing.resolve(TRACK_ID).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StreamError);
    expect((error as StreamError).code).toBe('STREAM_RESOLVER_MISSING');
    expect(run).not.toHaveBeenCalled();
  });

  it('raises STREAM_RESOLVE_FAILED on non-zero exit with stderr summary', async () => {
    const { resolver } = makeResolver({
      code: 1,
      stdout: '',
      stderr: 'WARNING: something\nERROR: Video unavailable',
      killed: false,
    });

    await expect(resolver.resolve(TRACK_ID)).rejects.toMatchObject({
      code: 'STREAM_RESOLVE_FAILED',
      message: expect.stringContaining('Video unavailable') as unknown,
    });
  });

  it('gives an actionable hint on the YouTube bot check', async () => {
    const { resolver } = makeResolver({
      code: 1,
      stdout: '',
      stderr: 'ERROR: [youtube] x: Sign in to confirm you\u2019re not a bot. Use --cookies',
      killed: false,
    });

    const error = await resolver.resolve(TRACK_ID).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StreamError);
    expect((error as StreamError).message).toContain('youtube.cookiesFrom');
  });

  it('raises STREAM_RESOLVE_FAILED with a timeout message when killed', async () => {
    const { resolver } = makeResolver({ code: -1, stdout: '', stderr: '', killed: true });

    await expect(resolver.resolve(TRACK_ID)).rejects.toMatchObject({
      code: 'STREAM_RESOLVE_FAILED',
      message: expect.stringContaining('timed out') as unknown,
    });
  });

  it('raises STREAM_RESOLVE_FAILED on unparseable output', async () => {
    const { resolver } = makeResolver({ code: 0, stdout: 'not json', stderr: '', killed: false });

    await expect(resolver.resolve(TRACK_ID)).rejects.toMatchObject({
      code: 'STREAM_RESOLVE_FAILED',
    });
  });

  it('raises STREAM_RESOLVE_FAILED when no playable URL is present', async () => {
    const { resolver } = makeResolver({
      code: 0,
      stdout: JSON.stringify({ ext: 'webm' }),
      stderr: '',
      killed: false,
    });

    await expect(resolver.resolve(TRACK_ID)).rejects.toMatchObject({
      code: 'STREAM_RESOLVE_FAILED',
    });
  });

  it('does not cache failures', async () => {
    const { resolver, cache } = makeResolver({
      code: 1,
      stdout: '',
      stderr: 'boom',
      killed: false,
    });

    await expect(resolver.resolve(TRACK_ID)).rejects.toBeInstanceOf(StreamError);
    expect(cache.data.has(`stream:${TRACK_ID}`)).toBe(false);
  });
});
