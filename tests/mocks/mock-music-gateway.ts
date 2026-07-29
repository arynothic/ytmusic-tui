import { ApiError } from '@/core/errors';
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

/** Seed data for {@link MockMusicGateway}. */
export interface MockGatewayData {
  readonly tracks?: Track[];
  readonly albums?: AlbumDetails[];
  readonly artists?: ArtistDetails[];
  readonly playlists?: PlaylistDetails[];
  readonly lyricsByTrack?: ReadonlyMap<string, Lyrics>;
  readonly likedSongs?: Track[];
  readonly history?: Track[];
  readonly userName?: string;
}

/**
 * Complete in-memory MusicGateway fake. Implements the full port so it
 * can back service- and command-level integration tests. Search matches
 * case-insensitively against titles and artist names.
 */
export class MockMusicGateway implements MusicGateway {
  readonly tracks: Track[];
  readonly albums: AlbumDetails[];
  readonly artists: ArtistDetails[];
  readonly playlists: PlaylistDetails[];
  readonly lyricsByTrack: Map<string, Lyrics>;
  readonly likedSongs: Track[];
  readonly history: Track[];
  userName: string;

  /** Every credential set passed to authenticate(), for assertions. */
  readonly authenticateCalls: Credentials[] = [];
  /** When set, authenticate() rejects with this error. */
  failOnAuthenticate: Error | undefined;
  #credentials: Credentials | undefined;
  #playlistCounter = 0;

  constructor(data: MockGatewayData = {}) {
    this.tracks = [...(data.tracks ?? [])];
    this.albums = [...(data.albums ?? [])];
    this.artists = [...(data.artists ?? [])];
    this.playlists = [...(data.playlists ?? [])];
    this.lyricsByTrack = new Map(data.lyricsByTrack ?? []);
    this.likedSongs = [...(data.likedSongs ?? [])];
    this.history = [...(data.history ?? [])];
    this.userName = data.userName ?? 'Test User';
  }

  isAuthenticated(): boolean {
    return this.#credentials !== undefined;
  }

  authenticate(credentials: Credentials): Promise<void> {
    this.authenticateCalls.push(credentials);
    if (this.failOnAuthenticate !== undefined) {
      return Promise.reject(this.failOnAuthenticate);
    }
    this.#credentials = credentials;
    return Promise.resolve();
  }

  deauthenticate(): Promise<void> {
    this.#credentials = undefined;
    return Promise.resolve();
  }

  getAuthenticatedUser(): Promise<string | undefined> {
    return Promise.resolve(this.isAuthenticated() ? this.userName : undefined);
  }

  search(
    query: string,
    filter: SearchFilter | null,
    options: SearchOptions = {},
  ): Promise<SearchResults> {
    const limit = options.limit ?? 20;
    const needle = query.toLowerCase();
    const matches = (text: string): boolean => text.toLowerCase().includes(needle);
    const trackMatches = (track: Track): boolean =>
      matches(track.title) || track.artists.some((artist) => matches(artist.name));

    const tracks =
      filter === null || filter === 'songs' || filter === 'videos'
        ? this.tracks
            .filter(trackMatches)
            .filter((track) =>
              filter === 'songs' ? !track.isVideo : filter === 'videos' ? track.isVideo : true,
            )
            .slice(0, limit)
        : [];
    const albums =
      filter === null || filter === 'albums'
        ? this.albums.filter((album) => matches(album.title)).slice(0, limit)
        : [];
    const artists =
      filter === null || filter === 'artists'
        ? this.artists.filter((artist) => matches(artist.name)).slice(0, limit)
        : [];
    const playlists =
      filter === null || filter === 'playlists'
        ? this.playlists.filter((playlist) => matches(playlist.title)).slice(0, limit)
        : [];

    return Promise.resolve({
      query,
      filter,
      tracks,
      albums,
      artists,
      playlists,
      continuation: null,
    });
  }

  async *searchPages(query: string, filter: SearchFilter | null): AsyncIterable<SearchResults> {
    yield await this.search(query, filter);
  }

  getTrack(id: VideoId): Promise<Track> {
    const track = this.tracks.find((candidate) => candidate.id === id);
    if (track === undefined) {
      throw new ApiError('API_NOT_FOUND', `Track "${id}" not found`);
    }
    return Promise.resolve(track);
  }

  getAlbum(id: AlbumId): Promise<AlbumDetails> {
    const album = this.albums.find((candidate) => candidate.id === id);
    if (album === undefined) {
      throw new ApiError('API_NOT_FOUND', `Album "${id}" not found`);
    }
    return Promise.resolve(album);
  }

  getArtist(id: ArtistId): Promise<ArtistDetails> {
    const artist = this.artists.find((candidate) => candidate.id === id);
    if (artist === undefined) {
      throw new ApiError('API_NOT_FOUND', `Artist "${id}" not found`);
    }
    return Promise.resolve(artist);
  }

  getPlaylist(id: PlaylistId): Promise<PlaylistDetails> {
    const playlist = this.playlists.find((candidate) => candidate.id === id);
    if (playlist === undefined) {
      throw new ApiError('API_NOT_FOUND', `Playlist "${id}" not found`);
    }
    return Promise.resolve(playlist);
  }

  getLyrics(trackId: VideoId): Promise<Lyrics | null> {
    return Promise.resolve(this.lyricsByTrack.get(trackId) ?? null);
  }

  getLikedSongs(options: { limit?: number } = {}): Promise<Track[]> {
    return Promise.resolve(this.likedSongs.slice(0, options.limit ?? this.likedSongs.length));
  }

  getLibraryAlbums(): Promise<Album[]> {
    return Promise.resolve([...this.albums]);
  }

  getLibraryArtists(): Promise<Artist[]> {
    return Promise.resolve(this.artists.map(({ id, name }) => ({ id, name })));
  }

  getLibraryPlaylists(): Promise<Playlist[]> {
    return Promise.resolve([...this.playlists]);
  }

  getHistory(options: { limit?: number } = {}): Promise<Track[]> {
    return Promise.resolve(this.history.slice(0, options.limit ?? this.history.length));
  }

  createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
    this.#playlistCounter += 1;
    const id = PlaylistIdSchema.parse(`PL_mock_${String(this.#playlistCounter)}`);
    const playlist: PlaylistDetails = {
      id,
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      tracks: [],
    };
    this.playlists.push(playlist);
    return Promise.resolve(playlist);
  }

  renamePlaylist(id: PlaylistId, title: string): Promise<void> {
    const playlist = this.#requirePlaylist(id);
    playlist.title = title;
    return Promise.resolve();
  }

  deletePlaylist(id: PlaylistId): Promise<void> {
    const index = this.playlists.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      throw new ApiError('API_NOT_FOUND', `Playlist "${id}" not found`);
    }
    this.playlists.splice(index, 1);
    return Promise.resolve();
  }

  addTracksToPlaylist(id: PlaylistId, trackIds: readonly VideoId[]): Promise<void> {
    const playlist = this.#requirePlaylist(id);
    for (const trackId of trackIds) {
      const track = this.tracks.find((candidate) => candidate.id === trackId);
      if (track === undefined) {
        throw new ApiError('API_NOT_FOUND', `Track "${trackId}" not found`);
      }
      playlist.tracks.push({
        ...track,
        setVideoId: `SV_${id}_${String(playlist.tracks.length)}`,
      });
    }
    return Promise.resolve();
  }

  removeTracksFromPlaylist(id: PlaylistId, setVideoIds: readonly string[]): Promise<void> {
    const playlist = this.#requirePlaylist(id);
    const remove = new Set(setVideoIds);
    playlist.tracks = playlist.tracks.filter(
      (track) => track.setVideoId === undefined || !remove.has(track.setVideoId),
    );
    return Promise.resolve();
  }

  #requirePlaylist(id: PlaylistId): PlaylistDetails {
    const playlist = this.playlists.find((candidate) => candidate.id === id);
    if (playlist === undefined) {
      throw new ApiError('API_NOT_FOUND', `Playlist "${id}" not found`);
    }
    return playlist;
  }
}
