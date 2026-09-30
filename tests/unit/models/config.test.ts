import { describe, expect, it } from 'vitest';

import { AppConfigSchema, DEFAULT_CONFIG } from '@/models';

describe('AppConfigSchema', () => {
  it('produces a complete config from an empty object', () => {
    expect(DEFAULT_CONFIG).toEqual({
      player: { backend: 'auto', volume: 80 },
      cache: {
        searchTtlSeconds: 300,
        metadataTtlSeconds: 86_400,
        streamTtlSeconds: 18_000,
        maxEntries: 5000,
      },
      download: { audioFormat: 'bestaudio' },
      search: { limit: 20 },
      youtube: { cookiesFrom: '' },
      logging: { level: 'info', pretty: false },
      rateLimit: { requestsPerSecond: 5 },
    });
  });

  it('merges partial sections with defaults', () => {
    const config = AppConfigSchema.parse({
      player: { volume: 30 },
      logging: { level: 'debug' },
    });
    expect(config.player.volume).toBe(30);
    expect(config.player.backend).toBe('auto');
    expect(config.logging.level).toBe('debug');
    expect(config.logging.pretty).toBe(false);
    expect(config.cache.searchTtlSeconds).toBe(300);
  });

  it('accepts explicit binary paths and formats', () => {
    const config = AppConfigSchema.parse({
      player: { backend: 'mpv', mpvPath: '/usr/local/bin/mpv' },
      download: { directory: '/tmp/music', audioFormat: 'flac' },
    });
    expect(config.player.mpvPath).toBe('/usr/local/bin/mpv');
    expect(config.download.audioFormat).toBe('flac');
  });

  it('rejects invalid values', () => {
    expect(() => AppConfigSchema.parse({ player: { backend: 'spotify' } })).toThrowError();
    expect(() => AppConfigSchema.parse({ player: { volume: 101 } })).toThrowError();
    expect(() => AppConfigSchema.parse({ cache: { searchTtlSeconds: -1 } })).toThrowError();
    expect(() => AppConfigSchema.parse({ search: { limit: 0 } })).toThrowError();
    expect(() => AppConfigSchema.parse({ logging: { level: 'chatty' } })).toThrowError();
  });
});
