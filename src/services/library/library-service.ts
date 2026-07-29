import { z } from 'zod';

import type { CacheStore, HistoryStore, MusicGateway } from '@/core/ports';
import {
  AlbumSchema,
  ArtistSchema,
  PlaylistSchema,
  TrackSchema,
  type Album,
  type Artist,
  type HistoryEntry,
  type Playlist,
  type Track,
} from '@/models';

/** Options for {@link LibraryService}. */
export interface LibraryServiceOptions {
  readonly gateway: MusicGateway;
  readonly cache: CacheStore;
  readonly historyStore: HistoryStore;
  /** Cache TTL for library metadata (albums/artists/playlists). */
  readonly metadataTtlMs: number;
  /** Shorter TTL for frequently changing lists (liked songs). */
  readonly volatileTtlMs: number;
}

const TrackListSchema = z.array(TrackSchema);
const AlbumListSchema = z.array(AlbumSchema);
const ArtistListSchema = z.array(ArtistSchema);
const PlaylistListSchema = z.array(PlaylistSchema);

/** Cache keys used by the library; also invalidated by playlist mutations. */
export const LIBRARY_CACHE_KEYS = {
  likedSongs: 'library:liked-songs',
  albums: 'library:albums',
  artists: 'library:artists',
  playlists: 'library:playlists',
} as const;

/**
 * Read access to the user's YouTube Music library with TTL caching, plus
 * the local playback history recorded by PlaybackService.
 */
export class LibraryService {
  readonly #gateway: MusicGateway;
  readonly #cache: CacheStore;
  readonly #historyStore: HistoryStore;
  readonly #metadataTtlMs: number;
  readonly #volatileTtlMs: number;

  constructor(options: LibraryServiceOptions) {
    this.#gateway = options.gateway;
    this.#cache = options.cache;
    this.#historyStore = options.historyStore;
    this.#metadataTtlMs = options.metadataTtlMs;
    this.#volatileTtlMs = options.volatileTtlMs;
  }

  /** Liked songs, freshest first as returned by the backend. */
  async getLikedSongs(options: { limit?: number } = {}): Promise<Track[]> {
    const cached = this.#cache.get(LIBRARY_CACHE_KEYS.likedSongs, TrackListSchema);
    const all = cached ?? (await this.#fetchLikedSongs());
    return options.limit === undefined ? all : all.slice(0, options.limit);
  }

  /** Fetches and caches the full liked-songs list. */
  async #fetchLikedSongs(): Promise<Track[]> {
    const tracks = await this.#gateway.getLikedSongs();
    this.#cache.set(LIBRARY_CACHE_KEYS.likedSongs, tracks, this.#volatileTtlMs);
    return tracks;
  }

  /** Albums saved in the user's library. */
  async getAlbums(): Promise<Album[]> {
    const cached = this.#cache.get(LIBRARY_CACHE_KEYS.albums, AlbumListSchema);
    if (cached !== undefined) {
      return cached;
    }
    const albums = await this.#gateway.getLibraryAlbums();
    this.#cache.set(LIBRARY_CACHE_KEYS.albums, albums, this.#metadataTtlMs);
    return albums;
  }

  /** Artists followed in the user's library. */
  async getArtists(): Promise<Artist[]> {
    const cached = this.#cache.get(LIBRARY_CACHE_KEYS.artists, ArtistListSchema);
    if (cached !== undefined) {
      return cached;
    }
    const artists = await this.#gateway.getLibraryArtists();
    this.#cache.set(LIBRARY_CACHE_KEYS.artists, artists, this.#metadataTtlMs);
    return artists;
  }

  /** Playlists (and podcasts) in the user's library. */
  async getPlaylists(): Promise<Playlist[]> {
    const cached = this.#cache.get(LIBRARY_CACHE_KEYS.playlists, PlaylistListSchema);
    if (cached !== undefined) {
      return cached;
    }
    const playlists = await this.#gateway.getLibraryPlaylists();
    this.#cache.set(LIBRARY_CACHE_KEYS.playlists, playlists, this.#metadataTtlMs);
    return playlists;
  }

  /** Locally recorded playback history, most recent first. */
  getLocalHistory(limit: number): HistoryEntry[] {
    return this.#historyStore.recent(limit);
  }

  /** Account-level YouTube Music history (never cached). */
  getRemoteHistory(options: { limit?: number } = {}): Promise<Track[]> {
    return this.#gateway.getHistory(options);
  }

  /** Clears the local playback history. */
  clearLocalHistory(): void {
    this.#historyStore.clear();
  }

  /** Drops every cached library list, forcing a refetch. */
  invalidate(): void {
    for (const key of Object.values(LIBRARY_CACHE_KEYS)) {
      this.#cache.delete(key);
    }
  }
}
