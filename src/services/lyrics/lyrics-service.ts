import type { CacheStore, MusicGateway } from '@/core/ports';
import { LyricsSchema, type Lyrics, type Track } from '@/models';

/** Options for {@link LyricsService}. */
export interface LyricsServiceOptions {
  readonly gateway: MusicGateway;
  readonly cache: CacheStore;
  /** Cache TTL for lyrics in milliseconds. */
  readonly lyricsTtlMs: number;
}

const CachedLyricsSchema = LyricsSchema.nullable();

/**
 * Lyrics access with caching (including negative results — a track
 * without lyrics should not re-hit the backend on every display).
 */
export class LyricsService {
  readonly #gateway: MusicGateway;
  readonly #cache: CacheStore;
  readonly #lyricsTtlMs: number;

  constructor(options: LyricsServiceOptions) {
    this.#gateway = options.gateway;
    this.#cache = options.cache;
    this.#lyricsTtlMs = options.lyricsTtlMs;
  }

  /** Fetches lyrics for a track, or null when none exist. */
  async getLyrics(track: Track): Promise<Lyrics | null> {
    const cacheKey = `lyrics:${track.id}`;
    const cached = this.#cache.get(cacheKey, CachedLyricsSchema);
    if (cached !== undefined) {
      return cached;
    }
    const lyrics = await this.#gateway.getLyrics(track.id);
    this.#cache.set(cacheKey, lyrics, this.#lyricsTtlMs);
    return lyrics;
  }

  /**
   * Index of the lyric line active at a playback position (milliseconds),
   * or -1 when nothing is active yet / the lyrics are not synchronized.
   */
  activeLine(lyrics: Lyrics, positionMs: number): number {
    if (!lyrics.hasTimestamps) {
      return -1;
    }
    let active = -1;
    for (let index = 0; index < lyrics.lines.length; index += 1) {
      const startMs = lyrics.lines[index]?.startMs;
      if (startMs !== null && startMs !== undefined && startMs <= positionMs) {
        active = index;
      } else if (startMs !== null && startMs !== undefined && startMs > positionMs) {
        break;
      }
    }
    return active;
  }
}
