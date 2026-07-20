import type { Logger } from 'pino';

import { ApiError, AuthError, isRetryableError } from '@/core/errors';
import type { CreatePlaylistInput, MusicGateway, SearchOptions } from '@/core/ports';
import {
  PlaylistIdSchema,
  type Album,
  type AlbumDetails,
  type AlbumId,
  type Artist,
  type ArtistDetails,
  type ArtistId,
  type Credentials,
  type Lyrics,
  type Playlist,
  type PlaylistDetails,
  type PlaylistId,
  type SearchFilter,
  type SearchResults,
  type Track,
  type VideoId,
} from '@/models';
import { normalizeClientError } from '@/services/gateway/error-normalizer';
import {
  collectListItems,
  readShelfItems,
  readShelfTitle,
  readText,
  ShelfSchema,
} from '@/services/gateway/loose-schemas';
import {
  mapAlbum,
  mapAlbumDetails,
  mapArtist,
  mapArtistDetails,
  mapLyrics,
  mapPlaylist,
  mapPlaylistDetails,
  mapTrack,
  mapTrackInfo,
} from '@/services/gateway/mappers';
import type { MusicClient, MusicClientFactory } from '@/services/gateway/music-client';
import { withRetry, type RetryOptions, type TokenBucketRateLimiter } from '@/utils';

/** Options for {@link YouTubeMusicGateway}. */
export interface YouTubeMusicGatewayOptions {
  readonly factory: MusicClientFactory;
  readonly rateLimiter: TokenBucketRateLimiter;
  readonly logger?: Logger;
  /** Retry behavior overrides, mainly for tests. */
  readonly retry?: RetryOptions;
}

/** Maps our domain search filters to vendor search types. */
const FILTER_TO_VENDOR_TYPE: Record<SearchFilter, string> = {
  songs: 'song',
  videos: 'video',
  albums: 'album',
  artists: 'artist',
  playlists: 'playlist',
  // youtubei.js has no podcast search type; podcasts surface as playlists.
  podcasts: 'playlist',
};

/** The internal playlist id for the user's liked songs. */
const LIKED_SONGS_PLAYLIST_ID = 'LL';

/** Safety cap for {@link YouTubeMusicGateway.searchPages}. */
const MAX_SEARCH_PAGES = 50;

/**
 * MusicGateway implementation backed by youtubei.js. Applies rate
 * limiting and retry-with-backoff to every request, normalizes vendor
 * errors into the AppError taxonomy, and validates every payload through
 * the loose-schema mapper layer. Continuation tokens are opaque strings
 * referencing in-process page state.
 */
export class YouTubeMusicGateway implements MusicGateway {
  readonly #factory: MusicClientFactory;
  readonly #limiter: TokenBucketRateLimiter;
  readonly #logger: Logger | undefined;
  readonly #retry: RetryOptions | undefined;
  #client: MusicClient | undefined;
  #credentials: Credentials | undefined;
  #continuations = new Map<string, unknown>();
  #continuationCounter = 0;

  constructor(options: YouTubeMusicGatewayOptions) {
    this.#factory = options.factory;
    this.#limiter = options.rateLimiter;
    this.#logger = options.logger;
    this.#retry = options.retry;
  }

  isAuthenticated(): boolean {
    return this.#credentials !== undefined;
  }

  async authenticate(credentials: Credentials): Promise<void> {
    const client = await this.#factory({
      cookie: credentials.cookie,
      ...(credentials.visitorData !== undefined ? { visitorData: credentials.visitorData } : {}),
    });
    // Validate the session with an authenticated endpoint before accepting it.
    try {
      await this.#call(() => client.music.getLibrary(), 'Validating session');
    } catch (error) {
      throw error instanceof AuthError
        ? error
        : new AuthError(
            'AUTH_INVALID_CREDENTIALS',
            'The provided cookies were rejected by YouTube Music',
            { cause: error },
          );
    }
    this.#client = client;
    this.#credentials = credentials;
  }

  deauthenticate(): Promise<void> {
    this.#client = undefined;
    this.#credentials = undefined;
    this.#continuations.clear();
    return Promise.resolve();
  }

  async getAuthenticatedUser(): Promise<string | undefined> {
    if (this.#client === undefined) {
      return undefined;
    }
    try {
      const info: unknown = await this.#client.account?.getInfo?.();
      if (info !== null && typeof info === 'object') {
        const record = info as Record<string, unknown>;
        return readText(record['name']) ?? readText(record['channel_name']);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  async search(
    query: string,
    filter: SearchFilter | null,
    options: SearchOptions = {},
  ): Promise<SearchResults> {
    const client = await this.#ensureClient();
    let response: unknown;
    if (options.continuation !== undefined && options.continuation !== null) {
      response = await this.#fetchContinuation(options.continuation);
    } else {
      const vendorType = filter === null ? 'all' : FILTER_TO_VENDOR_TYPE[filter];
      response = await this.#call(
        () => client.music.search(query, { type: vendorType }),
        `Searching for "${query}"`,
      );
    }
    return this.#mapSearchResponse(query, filter, response, options.limit);
  }

  async *searchPages(query: string, filter: SearchFilter | null): AsyncIterable<SearchResults> {
    let page = await this.search(query, filter);
    yield page;
    let pages = 1;
    while (page.continuation !== null && pages < MAX_SEARCH_PAGES) {
      page = await this.search(query, filter, { continuation: page.continuation });
      pages += 1;
      yield page;
    }
  }

  async getTrack(id: VideoId): Promise<Track> {
    const client = await this.#ensureClient();
    const response = await this.#call(
      () => client.music.getInfo(id),
      `Fetching track ${id}`,
    );
    const track = mapTrackInfo(response);
    if (track === undefined) {
      throw new ApiError('API_NOT_FOUND', `Track "${id}" not found`);
    }
    return track;
  }

  async getAlbum(id: AlbumId): Promise<AlbumDetails> {
    const client = await this.#ensureClient();
    const response = await this.#call(() => client.music.getAlbum(id), `Fetching album ${id}`);
    const album = mapAlbumDetails(id, response);
    if (album === undefined) {
      throw new ApiError('API_UNEXPECTED_RESPONSE', `Album "${id}" returned an unusable payload`);
    }
    return album;
  }

  async getArtist(id: ArtistId): Promise<ArtistDetails> {
    const client = await this.#ensureClient();
    const response = await this.#call(
      () => client.music.getArtist(id),
      `Fetching artist ${id}`,
    );
    const artist = mapArtistDetails(id, response);
    if (artist === undefined) {
      throw new ApiError('API_UNEXPECTED_RESPONSE', `Artist "${id}" returned an unusable payload`);
    }
    return artist;
  }

  async getPlaylist(id: PlaylistId): Promise<PlaylistDetails> {
    const client = await this.#ensureClient();
    const response = await this.#call(
      () => client.music.getPlaylist(id),
      `Fetching playlist ${id}`,
    );
    const playlist = mapPlaylistDetails(id, response);
    if (playlist === undefined) {
      throw new ApiError(
        'API_UNEXPECTED_RESPONSE',
        `Playlist "${id}" returned an unusable payload`,
      );
    }
    return playlist;
  }

  async getLyrics(trackId: VideoId): Promise<Lyrics | null> {
    const client = await this.#ensureClient();
    const shelf = await this.#call(
      () => client.music.getLyrics(trackId),
      `Fetching lyrics for ${trackId}`,
    );
    return mapLyrics(trackId, shelf);
  }

  async getLikedSongs(options: { limit?: number } = {}): Promise<Track[]> {
    const playlist = await this.getPlaylist(PlaylistIdSchema.parse(LIKED_SONGS_PLAYLIST_ID));
    return options.limit === undefined ? playlist.tracks : playlist.tracks.slice(0, options.limit);
  }

  async getLibraryAlbums(): Promise<Album[]> {
    return this.#mapLibraryShelf(/album/i, (nodes) =>
      nodes.map(mapAlbum).filter((album): album is Album => album !== undefined),
    );
  }

  async getLibraryArtists(): Promise<Artist[]> {
    return this.#mapLibraryShelf(/artist/i, (nodes) =>
      nodes.map(mapArtist).filter((artist): artist is Artist => artist !== undefined),
    );
  }

  async getLibraryPlaylists(): Promise<Playlist[]> {
    return this.#mapLibraryShelf(/playlist|podcast/i, (nodes) =>
      nodes.map(mapPlaylist).filter((playlist): playlist is Playlist => playlist !== undefined),
    );
  }

  async getHistory(options: { limit?: number } = {}): Promise<Track[]> {
    const client = await this.#ensureClient();
    const response = await this.#call(() => client.getHistory(), 'Fetching history');
    const tracks = collectListItems(response)
      .map(mapTrack)
      .filter((track): track is Track => track !== undefined);
    return options.limit === undefined ? tracks : tracks.slice(0, options.limit);
  }

  async createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
    const client = await this.#ensureClient();
    const response = await this.#call(
      () => client.playlist.create(input.title, []),
      `Creating playlist "${input.title}"`,
    );
    const id = readResponseField(response, 'playlist_id');
    if (id === undefined) {
      throw new ApiError('API_UNEXPECTED_RESPONSE', 'Playlist creation returned no id');
    }
    const playlistId = PlaylistIdSchema.parse(id);
    // Fetch the created playlist to return a fully populated model.
    return this.getPlaylist(playlistId);
  }

  async renamePlaylist(id: PlaylistId, title: string): Promise<void> {
    const client = await this.#ensureClient();
    await this.#call(
      () => client.playlist.setName(id, title),
      `Renaming playlist ${id}`,
    );
  }

  async deletePlaylist(id: PlaylistId): Promise<void> {
    const client = await this.#ensureClient();
    await this.#call(() => client.playlist.delete(id), `Deleting playlist ${id}`);
  }

  async addTracksToPlaylist(id: PlaylistId, trackIds: readonly VideoId[]): Promise<void> {
    const client = await this.#ensureClient();
    await this.#call(
      () => client.playlist.addVideos(id, [...trackIds]),
      `Adding tracks to playlist ${id}`,
    );
  }

  async removeTracksFromPlaylist(id: PlaylistId, setVideoIds: readonly string[]): Promise<void> {
    const client = await this.#ensureClient();
    await this.#call(
      () => client.playlist.removeVideos(id, [...setVideoIds], true),
      `Removing tracks from playlist ${id}`,
    );
  }

  /** Returns the active client, creating an anonymous one on first use. */
  async #ensureClient(): Promise<MusicClient> {
    this.#client ??= await this.#factory({});
    return this.#client;
  }

  /**
   * Runs a client operation with rate limiting, retry on transient
   * failures, and error normalization.
   */
  async #call<T>(operation: () => Promise<T>, context: string): Promise<T> {
    try {
      return await this.#limiter.execute(() =>
        withRetry(async () => {
          try {
            return await operation();
          } catch (error) {
            throw normalizeClientError(error, context);
          }
        }, this.#retry ?? { isRetryable: isRetryableError, onRetry: (info) => this.#onRetry(info, context) }),
      );
    } catch (error) {
      throw normalizeClientError(error, context);
    }
  }

  #onRetry(
    info: { attempt: number; error: unknown; delayMs: number },
    context: string,
  ): void {
    this.#logger?.warn(
      { attempt: info.attempt, delayMs: info.delayMs, context },
      'retrying YouTube Music request',
    );
  }

  /** Fetches the next page of a previous search via its continuation token. */
  async #fetchContinuation(token: string): Promise<unknown> {
    const previous = this.#continuations.get(token);
    if (previous === undefined) {
      throw new ApiError(
        'API_UNEXPECTED_RESPONSE',
        'Unknown or expired search continuation token',
      );
    }
    this.#continuations.delete(token);
    const getContinuation = (previous as { getContinuation?: unknown }).getContinuation;
    if (typeof getContinuation !== 'function') {
      throw new ApiError('API_UNEXPECTED_RESPONSE', 'Search continuation is not available');
    }
    return this.#call(
      () => (previous as { getContinuation: () => Promise<unknown> }).getContinuation(),
      'Fetching next search page',
    );
  }

  /** Maps a search response page to domain SearchResults. */
  #mapSearchResponse(
    query: string,
    filter: SearchFilter | null,
    response: unknown,
    limit?: number,
  ): SearchResults {
    const nodes = collectListItems(response);
    const slice = <T>(items: T[]): T[] => (limit === undefined ? items : items.slice(0, limit));

    const includeTracks = filter === null || filter === 'songs' || filter === 'videos';
    const tracks = includeTracks
      ? slice(
          nodes
            .map(mapTrack)
            .filter((track): track is Track => track !== undefined)
            .filter((track) =>
              filter === 'songs' ? !track.isVideo : filter === 'videos' ? track.isVideo : true,
            ),
        )
      : [];
    const albums =
      filter === null || filter === 'albums'
        ? slice(nodes.map(mapAlbum).filter((album): album is Album => album !== undefined))
        : [];
    const artists =
      filter === null || filter === 'artists'
        ? slice(nodes.map(mapArtist).filter((artist): artist is Artist => artist !== undefined))
        : [];
    const playlists =
      filter === null || filter === 'playlists' || filter === 'podcasts'
        ? slice(
            nodes
              .map(mapPlaylist)
              .filter((playlist): playlist is Playlist => playlist !== undefined),
          )
        : [];

    return {
      query,
      filter,
      tracks,
      albums,
      artists,
      playlists,
      continuation: this.#storeContinuation(response),
    };
  }

  /** Stores page state for continuation when more pages exist. */
  #storeContinuation(response: unknown): string | null {
    if (response === null || typeof response !== 'object') {
      return null;
    }
    const record = response as Record<string, unknown>;
    if (record['has_continuation'] !== true || typeof record['getContinuation'] !== 'function') {
      return null;
    }
    this.#continuationCounter += 1;
    const token = `page-${String(this.#continuationCounter)}`;
    this.#continuations.set(token, response);
    return token;
  }

  /** Maps one library shelf category using the given classifier. */
  async #mapLibraryShelf<T>(
    titlePattern: RegExp,
    map: (nodes: unknown[]) => T[],
  ): Promise<T[]> {
    const client = await this.#ensureClient();
    const response = await this.#call(() => client.music.getLibrary(), 'Fetching library');
    if (response === null || typeof response !== 'object') {
      return [];
    }
    const contents = (response as Record<string, unknown>)['contents'];
    if (!Array.isArray(contents)) {
      return [];
    }
    const results: T[] = [];
    for (const sectionNode of contents) {
      const section = ShelfSchema.safeParse(sectionNode);
      if (!section.success) {
        continue;
      }
      const title = readShelfTitle(section.data) ?? '';
      if (titlePattern.test(title)) {
        results.push(...map(readShelfItems(section.data)));
      }
    }
    return results;
  }
}

/** Reads a simple string field from an unknown response object. */
function readResponseField(response: unknown, field: string): string | undefined {
  if (response === null || typeof response !== 'object') {
    return undefined;
  }
  const value = (response as Record<string, unknown>)[field];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
