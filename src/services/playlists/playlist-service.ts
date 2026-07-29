import { ValidationError } from '@/core/errors';
import type { CacheStore, CreatePlaylistInput, MusicGateway } from '@/core/ports';
import {
  PlaylistIdSchema,
  VideoIdSchema,
  type Playlist,
  type PlaylistDetails,
  type VideoId,
} from '@/models';
import { LIBRARY_CACHE_KEYS } from '@/services/library/library-service';

/** Options for {@link PlaylistService}. */
export interface PlaylistServiceOptions {
  readonly gateway: MusicGateway;
  readonly cache: CacheStore;
}

/**
 * Playlist management: validation, gateway calls, and library-cache
 * invalidation so listings reflect mutations immediately.
 */
export class PlaylistService {
  readonly #gateway: MusicGateway;
  readonly #cache: CacheStore;

  constructor(options: PlaylistServiceOptions) {
    this.#gateway = options.gateway;
    this.#cache = options.cache;
  }

  /** Lists the user's playlists (through the cached library view). */
  list(): Promise<Playlist[]> {
    return this.#gateway.getLibraryPlaylists();
  }

  /** Fetches a playlist with its tracks. */
  get(id: string): Promise<PlaylistDetails> {
    return this.#gateway.getPlaylist(this.#parsePlaylistId(id));
  }

  /** Creates a playlist and invalidates the cached library listing. */
  async create(input: CreatePlaylistInput): Promise<Playlist> {
    if (input.title.trim() === '') {
      throw new ValidationError('Playlist title must not be empty');
    }
    const playlist = await this.#gateway.createPlaylist({ ...input, title: input.title.trim() });
    this.#invalidateLibrary();
    return playlist;
  }

  /** Renames a playlist. */
  async rename(id: string, title: string): Promise<void> {
    if (title.trim() === '') {
      throw new ValidationError('Playlist title must not be empty');
    }
    await this.#gateway.renamePlaylist(this.#parsePlaylistId(id), title.trim());
    this.#invalidateLibrary();
  }

  /** Deletes a playlist. */
  async delete(id: string): Promise<void> {
    await this.#gateway.deletePlaylist(this.#parsePlaylistId(id));
    this.#invalidateLibrary();
  }

  /** Adds tracks by video id. */
  async addTracks(id: string, trackIds: readonly string[]): Promise<void> {
    if (trackIds.length === 0) {
      throw new ValidationError('No track ids given');
    }
    const parsed = trackIds.map((trackId) => this.#parseTrackId(trackId));
    await this.#gateway.addTracksToPlaylist(this.#parsePlaylistId(id), parsed);
    this.#invalidateLibrary();
  }

  /** Removes entries by their setVideoId (see PlaylistTrack). */
  async removeTracks(id: string, setVideoIds: readonly string[]): Promise<void> {
    if (setVideoIds.length === 0) {
      throw new ValidationError('No entries given');
    }
    await this.#gateway.removeTracksFromPlaylist(this.#parsePlaylistId(id), setVideoIds);
    this.#invalidateLibrary();
  }

  /** Parses a playlist id, raising ValidationError on bad input. */
  #parsePlaylistId(id: string) {
    const parsed = PlaylistIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new ValidationError(`Invalid playlist id: "${id}"`);
    }
    return parsed.data;
  }

  /** Parses a video id, raising ValidationError on bad input. */
  #parseTrackId(id: string): VideoId {
    const parsed = VideoIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new ValidationError(`Invalid track id: "${id}"`);
    }
    return parsed.data;
  }

  /** Drops cached library lists affected by playlist mutations. */
  #invalidateLibrary(): void {
    this.#cache.delete(LIBRARY_CACHE_KEYS.playlists);
    this.#cache.delete(LIBRARY_CACHE_KEYS.likedSongs);
  }
}
