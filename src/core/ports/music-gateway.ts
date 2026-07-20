import type {
  Album,
  AlbumDetails,
  AlbumId,
  Artist,
  ArtistDetails,
  ArtistId,
  Credentials,
  Lyrics,
  Playlist,
  PlaylistDetails,
  PlaylistId,
  PlaylistPrivacy,
  SearchFilter,
  SearchResults,
  Track,
  VideoId,
} from '@/models';

/** Options for paginated searches. */
export interface SearchOptions {
  /** Maximum items to return per category. */
  readonly limit?: number;
  /** Continuation token from a previous page. */
  readonly continuation?: string | null;
}

/** Input for creating a playlist. */
export interface CreatePlaylistInput {
  readonly title: string;
  readonly description?: string;
  readonly privacy?: PlaylistPrivacy;
}

/**
 * Port to the YouTube Music backend. All payloads crossing this boundary
 * are validated against the domain schemas by the implementation.
 */
export interface MusicGateway {
  /** True when usable credentials are loaded into the client. */
  isAuthenticated(): boolean;

  /** Loads credentials into the client, validating the session. */
  authenticate(credentials: Credentials): Promise<void>;

  /** Drops any loaded credentials. */
  deauthenticate(): Promise<void>;

  /** Display name of the authenticated user, when known. */
  getAuthenticatedUser(): Promise<string | undefined>;

  /** Runs a single-page search. `filter` null means mixed top results. */
  search(
    query: string,
    filter: SearchFilter | null,
    options?: SearchOptions,
  ): Promise<SearchResults>;

  /** Streams successive search pages until exhausted or iteration stops. */
  searchPages(query: string, filter: SearchFilter | null): AsyncIterable<SearchResults>;

  getTrack(id: VideoId): Promise<Track>;
  getAlbum(id: AlbumId): Promise<AlbumDetails>;
  getArtist(id: ArtistId): Promise<ArtistDetails>;
  getPlaylist(id: PlaylistId): Promise<PlaylistDetails>;

  /** Lyrics for a track, or null when none exist. */
  getLyrics(trackId: VideoId): Promise<Lyrics | null>;

  getLikedSongs(options?: { limit?: number }): Promise<Track[]>;
  getLibraryAlbums(): Promise<Album[]>;
  getLibraryArtists(): Promise<Artist[]>;
  getLibraryPlaylists(): Promise<Playlist[]>;
  getHistory(options?: { limit?: number }): Promise<Track[]>;

  createPlaylist(input: CreatePlaylistInput): Promise<Playlist>;
  renamePlaylist(id: PlaylistId, title: string): Promise<void>;
  deletePlaylist(id: PlaylistId): Promise<void>;
  addTracksToPlaylist(id: PlaylistId, trackIds: readonly VideoId[]): Promise<void>;
  /** Removes playlist entries by their `setVideoId` (see PlaylistTrack). */
  removeTracksFromPlaylist(id: PlaylistId, setVideoIds: readonly string[]): Promise<void>;
}
