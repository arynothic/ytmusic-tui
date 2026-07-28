import { describe, expect, it, vi } from 'vitest';

import { ApiError, AuthError } from '@/core/errors';
import { AlbumIdSchema, ArtistIdSchema, PlaylistIdSchema, VideoIdSchema } from '@/models';
import type { MusicClient } from '@/services/gateway';
import { YouTubeMusicGateway } from '@/services/gateway';
import { TokenBucketRateLimiter } from '@/utils';

import {
  albumNode,
  albumPageFixture,
  artistNode,
  artistPageFixture,
  libraryFixture,
  playlistNode,
  playlistPageFixture,
  trackInfoFixture,
  trackNode,
  trackNodeTextTitle,
  videoNode,
} from './fixtures';

/** Builds a plain-object MusicClient fake with vi.fn() methods. */
function makeClient(
  overrides: Partial<{
    search: (query: string, filters?: { type?: string }) => Promise<unknown>;
    getInfo: (videoId: string) => Promise<unknown>;
    getAlbum: (albumId: string) => Promise<unknown>;
    getArtist: (artistId: string) => Promise<unknown>;
    getPlaylist: (playlistId: string) => Promise<unknown>;
    getLibrary: () => Promise<unknown>;
    getLyrics: (videoId: string) => Promise<unknown>;
    getHistory: () => Promise<unknown>;
    accountInfo: () => Promise<unknown>;
    playlistCreate: (title: string, videoIds: string[]) => Promise<unknown>;
    playlistDelete: (playlistId: string) => Promise<unknown>;
    playlistAddVideos: (playlistId: string, videoIds: string[]) => Promise<unknown>;
    playlistRemoveVideos: (
      playlistId: string,
      videoIds: string[],
      useSetVideoIds?: boolean,
    ) => Promise<unknown>;
    playlistSetName: (playlistId: string, name: string) => Promise<unknown>;
  }> = {},
) {
  const client: MusicClient = {
    music: {
      search: vi.fn(overrides.search ?? (async () => ({}))),
      getInfo: vi.fn(overrides.getInfo ?? (async () => ({}))),
      getAlbum: vi.fn(overrides.getAlbum ?? (async () => ({}))),
      getArtist: vi.fn(overrides.getArtist ?? (async () => ({}))),
      getPlaylist: vi.fn(overrides.getPlaylist ?? (async () => ({}))),
      getLibrary: vi.fn(overrides.getLibrary ?? (async () => ({}))),
      getLyrics: vi.fn(overrides.getLyrics ?? (async () => null)),
    },
    playlist: {
      create: vi.fn(overrides.playlistCreate ?? (async () => ({}))),
      delete: vi.fn(overrides.playlistDelete ?? (async () => ({}))),
      addVideos: vi.fn(overrides.playlistAddVideos ?? (async () => ({}))),
      removeVideos: vi.fn(overrides.playlistRemoveVideos ?? (async () => ({}))),
      setName: vi.fn(overrides.playlistSetName ?? (async () => ({}))),
    },
    getHistory: vi.fn(overrides.getHistory ?? (async () => [])),
    ...(overrides.accountInfo !== undefined
      ? { account: { getInfo: vi.fn(overrides.accountInfo) } }
      : {}),
  };
  return client;
}

/** Creates a gateway wired to the given fake client. */
function makeGateway(client: MusicClient) {
  const factory = vi.fn(async () => client);
  const gateway = new YouTubeMusicGateway({
    factory,
    rateLimiter: new TokenBucketRateLimiter({ capacity: 100, refillPerSecond: 1000 }),
    retry: { attempts: 2, sleep: () => Promise.resolve() },
  });
  return { gateway, factory };
}

const credentials = {
  cookie: 'SID=abc; HSID=def',
  visitorData: 'Cgt2aXNpdG9yLWRhdGE',
  savedAt: new Date().toISOString(),
};

describe('lazy client creation', () => {
  it('creates an anonymous client on first use', async () => {
    const client = makeClient();
    const { gateway, factory } = makeGateway(client);

    expect(gateway.isAuthenticated()).toBe(false);
    await gateway.search('coldplay', null);
    expect(factory).toHaveBeenCalledWith({});
  });
});

describe('search', () => {
  it.each([
    ['songs', 'song'],
    ['videos', 'video'],
    ['albums', 'album'],
    ['artists', 'artist'],
    ['playlists', 'playlist'],
    ['podcasts', 'playlist'],
  ] as const)('maps filter "%s" to vendor type "%s"', async (filter, vendorType) => {
    const client = makeClient();
    const { gateway } = makeGateway(client);

    await gateway.search('coldplay', filter);
    expect(client.music.search).toHaveBeenCalledWith('coldplay', { type: vendorType });
  });

  it('uses vendor type "all" for a null filter', async () => {
    const client = makeClient();
    const { gateway } = makeGateway(client);

    await gateway.search('coldplay', null);
    expect(client.music.search).toHaveBeenCalledWith('coldplay', { type: 'all' });
  });

  it('maps mixed results and reports no continuation when absent', async () => {
    const page = {
      contents: [{ contents: [trackNode, albumNode, artistNode, playlistNode] }],
      has_continuation: false,
    };
    const client = makeClient({ search: async () => page });
    const { gateway } = makeGateway(client);

    const results = await gateway.search('coldplay', null);
    expect(results.query).toBe('coldplay');
    expect(results.tracks.map((track) => track.id)).toEqual(['vid001']);
    expect(results.albums.map((album) => album.id)).toEqual(['MPREb_xy']);
    expect(results.artists.map((artist) => artist.name)).toEqual(['Coldplay']);
    expect(results.playlists.map((playlist) => playlist.id)).toEqual(['PLxyz']);
    expect(results.continuation).toBeNull();
  });

  it('filters songs vs videos by the isVideo flag', async () => {
    const page = { contents: [{ contents: [trackNode, videoNode] }], has_continuation: false };
    const client = makeClient({ search: async () => page });
    const { gateway } = makeGateway(client);

    const songs = await gateway.search('coldplay', 'songs');
    expect(songs.tracks.map((track) => track.id)).toEqual(['vid001']);
    expect(songs.albums).toEqual([]);

    const videos = await gateway.search('coldplay', 'videos');
    expect(videos.tracks.map((track) => track.id)).toEqual(['vid003']);
  });

  it('applies the per-category limit', async () => {
    const page = {
      contents: [{ contents: [trackNode, trackNodeTextTitle, videoNode] }],
      has_continuation: false,
    };
    const client = makeClient({ search: async () => page });
    const { gateway } = makeGateway(client);

    const results = await gateway.search('coldplay', null, { limit: 2 });
    expect(results.tracks).toHaveLength(2);
  });

  it('round-trips a continuation token through getContinuation()', async () => {
    const secondPage = { contents: [{ contents: [trackNodeTextTitle] }], has_continuation: false };
    const firstPage = {
      contents: [{ contents: [trackNode] }],
      has_continuation: true,
      getContinuation: vi.fn(async () => secondPage),
    };
    const client = makeClient({ search: async () => firstPage });
    const { gateway } = makeGateway(client);

    const pageOne = await gateway.search('coldplay', 'songs');
    expect(pageOne.continuation).toBe('page-1');
    expect(pageOne.tracks.map((track) => track.id)).toEqual(['vid001']);

    const pageTwo = await gateway.search('coldplay', 'songs', {
      continuation: pageOne.continuation,
    });
    expect(firstPage.getContinuation).toHaveBeenCalledOnce();
    expect(pageTwo.tracks.map((track) => track.id)).toEqual(['vid002']);
    expect(pageTwo.continuation).toBeNull();
  });

  it('rejects unknown or already-consumed continuation tokens', async () => {
    const client = makeClient();
    const { gateway } = makeGateway(client);

    await expect(
      gateway.search('coldplay', null, { continuation: 'page-99' }),
    ).rejects.toMatchObject({ code: 'API_UNEXPECTED_RESPONSE' });

    const firstPage = {
      contents: [{ contents: [trackNode] }],
      has_continuation: true,
      getContinuation: vi.fn(async () => ({})),
    };
    vi.mocked(client.music.search).mockImplementation(async () => firstPage);
    const pageOne = await gateway.search('coldplay', null);
    await gateway.search('coldplay', null, { continuation: pageOne.continuation });
    await expect(
      gateway.search('coldplay', null, { continuation: pageOne.continuation }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('searchPages', () => {
  it('yields successive pages until the continuation is exhausted', async () => {
    const pageTwo = { contents: [{ contents: [trackNodeTextTitle] }], has_continuation: false };
    const pageOne = {
      contents: [{ contents: [trackNode] }],
      has_continuation: true,
      getContinuation: vi.fn(async () => pageTwo),
    };
    const client = makeClient({ search: async () => pageOne });
    const { gateway } = makeGateway(client);

    const pages = [];
    for await (const page of gateway.searchPages('coldplay', 'songs')) {
      pages.push(page);
    }
    expect(pages).toHaveLength(2);
    expect(pages[0]?.tracks.map((track) => track.id)).toEqual(['vid001']);
    expect(pages[1]?.tracks.map((track) => track.id)).toEqual(['vid002']);
  });
});

describe('authenticate', () => {
  it('validates the session and stores credentials on success', async () => {
    const client = makeClient({ getLibrary: async () => libraryFixture });
    const { gateway, factory } = makeGateway(client);

    await gateway.authenticate(credentials);
    expect(factory).toHaveBeenCalledWith({
      cookie: credentials.cookie,
      visitorData: credentials.visitorData,
    });
    expect(client.music.getLibrary).toHaveBeenCalledOnce();
    expect(gateway.isAuthenticated()).toBe(true);
  });

  it('rejects with AuthError when the session is refused', async () => {
    const client = makeClient({
      getLibrary: () => Promise.reject(new Error('Request failed with status code 401')),
    });
    const { gateway } = makeGateway(client);

    await expect(gateway.authenticate(credentials)).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(gateway.isAuthenticated()).toBe(false);
  });

  it('wraps non-auth validation failures in AuthError', async () => {
    const client = makeClient({ getLibrary: () => Promise.reject(new Error('boom')) });
    const { gateway } = makeGateway(client);

    await expect(gateway.authenticate(credentials)).rejects.toBeInstanceOf(AuthError);
  });
});

describe('deauthenticate', () => {
  it('drops credentials, user info and pending continuations', async () => {
    const client = makeClient({
      getLibrary: async () => libraryFixture,
      accountInfo: async () => ({ name: { text: 'Ada' } }),
      search: async () => ({
        contents: [{ contents: [trackNode] }],
        has_continuation: true,
        getContinuation: vi.fn(async () => ({})),
      }),
    });
    const { gateway } = makeGateway(client);
    await gateway.authenticate(credentials);

    await gateway.deauthenticate();
    expect(gateway.isAuthenticated()).toBe(false);
    await expect(gateway.getAuthenticatedUser()).resolves.toBeUndefined();
  });
});

describe('getAuthenticatedUser', () => {
  it('returns undefined before a client exists', async () => {
    const client = makeClient();
    const { gateway } = makeGateway(client);
    await expect(gateway.getAuthenticatedUser()).resolves.toBeUndefined();
  });

  it('reads the display name from account info', async () => {
    const client = makeClient({
      getLibrary: async () => libraryFixture,
      accountInfo: async () => ({ name: { text: 'Ada' } }),
    });
    const { gateway } = makeGateway(client);
    await gateway.authenticate(credentials);
    await expect(gateway.getAuthenticatedUser()).resolves.toBe('Ada');
  });

  it('falls back to channel_name and swallows account failures', async () => {
    const client = makeClient({
      getLibrary: async () => libraryFixture,
      accountInfo: async () => ({ channel_name: 'ada-channel' }),
    });
    const { gateway } = makeGateway(client);
    await gateway.authenticate(credentials);
    await expect(gateway.getAuthenticatedUser()).resolves.toBe('ada-channel');

    const broken = makeClient({
      getLibrary: async () => libraryFixture,
      accountInfo: () => Promise.reject(new Error('no account')),
    });
    const { gateway: brokenGateway } = makeGateway(broken);
    await brokenGateway.authenticate(credentials);
    await expect(brokenGateway.getAuthenticatedUser()).resolves.toBeUndefined();
  });
});

describe('entity lookups', () => {
  it('getTrack maps music.getInfo payloads', async () => {
    const client = makeClient({ getInfo: async () => trackInfoFixture });
    const { gateway } = makeGateway(client);

    const track = await gateway.getTrack(VideoIdSchema.parse('vid001'));
    expect(client.music.getInfo).toHaveBeenCalledWith('vid001');
    expect(track.title).toBe('Fix You');
    expect(track.artists[0]).toEqual({ name: 'Coldplay', id: 'UCcold' });
    expect(track.durationSeconds).toBe(295);
  });

  it('getTrack raises API_NOT_FOUND on unusable payloads', async () => {
    const client = makeClient({ getInfo: async () => ({ basic_info: {} }) });
    const { gateway } = makeGateway(client);

    await expect(gateway.getTrack(VideoIdSchema.parse('vid404'))).rejects.toMatchObject({
      code: 'API_NOT_FOUND',
    });
  });

  it('getAlbum maps the album detail page', async () => {
    const client = makeClient({ getAlbum: async () => albumPageFixture });
    const { gateway } = makeGateway(client);

    const album = await gateway.getAlbum(AlbumIdSchema.parse('MPREb_xy'));
    expect(album.title).toBe('X&Y');
    expect(album.year).toBe('2005');
    expect(album.tracks).toHaveLength(2);
    expect(album.trackCount).toBe(2);
  });

  it('getArtist maps header plus shelves', async () => {
    const client = makeClient({ getArtist: async () => artistPageFixture });
    const { gateway } = makeGateway(client);

    const artist = await gateway.getArtist(ArtistIdSchema.parse('UCcold'));
    expect(artist.name).toBe('Coldplay');
    expect(artist.subscriberCount).toBe('25.4M subscribers');
    expect(artist.topTracks.map((track) => track.id)).toEqual(['vid001']);
    expect(artist.albums.map((album) => album.id)).toEqual(['MPREb_xy']);
    expect(artist.singles.map((album) => album.id)).toEqual(['MPREb_single']);
  });

  it('getPlaylist maps tracks with setVideoIds', async () => {
    const client = makeClient({ getPlaylist: async () => playlistPageFixture });
    const { gateway } = makeGateway(client);

    const playlist = await gateway.getPlaylist(PlaylistIdSchema.parse('PLxyz'));
    expect(playlist.title).toBe('RoadTrip');
    expect(playlist.tracks).toHaveLength(2);
    expect(playlist.tracks[0]?.setVideoId).toBe('SV_abc123');
  });

  it('raises API_UNEXPECTED_RESPONSE when a detail page is unusable', async () => {
    const client = makeClient({ getAlbum: async () => 42 });
    const { gateway } = makeGateway(client);

    await expect(gateway.getAlbum(AlbumIdSchema.parse('MPREb_bad'))).rejects.toMatchObject({
      code: 'API_UNEXPECTED_RESPONSE',
    });
  });
});

describe('getLyrics', () => {
  it('maps plain lyrics text with its source', async () => {
    const client = makeClient({
      getLyrics: async () => ({
        description: { text: 'Lights will guide you home\nAnd ignite your bones' },
        footer: { text: 'Source: Musixmatch' },
      }),
    });
    const { gateway } = makeGateway(client);

    const lyrics = await gateway.getLyrics(VideoIdSchema.parse('vid001'));
    expect(lyrics?.lines).toHaveLength(2);
    expect(lyrics?.hasTimestamps).toBe(false);
    expect(lyrics?.source).toBe('Source: Musixmatch');
  });

  it('detects LRC timestamps', async () => {
    const client = makeClient({
      getLyrics: async () => ({ description: { text: '[00:12.34] hello' } }),
    });
    const { gateway } = makeGateway(client);

    const lyrics = await gateway.getLyrics(VideoIdSchema.parse('vid001'));
    expect(lyrics?.hasTimestamps).toBe(true);
    expect(lyrics?.lines[0]?.startMs).toBe(12_340);
  });

  it('returns null when no lyrics exist', async () => {
    const client = makeClient({ getLyrics: async () => null });
    const { gateway } = makeGateway(client);
    await expect(gateway.getLyrics(VideoIdSchema.parse('vid001'))).resolves.toBeNull();
  });
});

describe('library', () => {
  it('getLikedSongs fetches the internal "LL" playlist and honors limit', async () => {
    const client = makeClient({ getPlaylist: async () => playlistPageFixture });
    const { gateway } = makeGateway(client);

    const liked = await gateway.getLikedSongs({ limit: 1 });
    expect(client.music.getPlaylist).toHaveBeenCalledWith('LL');
    expect(liked).toHaveLength(1);
    expect(liked[0]?.id).toBe('vid001');
  });

  it('classifies library shelves by title', async () => {
    const client = makeClient({ getLibrary: async () => libraryFixture });
    const { gateway } = makeGateway(client);

    const albums = await gateway.getLibraryAlbums();
    expect(albums.map((album) => album.id)).toEqual(['MPREb_xy']);

    const artists = await gateway.getLibraryArtists();
    expect(artists.map((artist) => artist.name)).toEqual(['Coldplay']);

    const playlists = await gateway.getLibraryPlaylists();
    expect(playlists.map((playlist) => playlist.id)).toEqual(['PLxyz']);
  });

  it('returns empty lists for an alien library payload', async () => {
    const client = makeClient({ getLibrary: async () => 'garbage' });
    const { gateway } = makeGateway(client);
    await expect(gateway.getLibraryAlbums()).resolves.toEqual([]);
  });
});

describe('getHistory', () => {
  it('maps history entries and applies the limit', async () => {
    const client = makeClient({
      getHistory: async () => ({ contents: [{ contents: [trackNode, trackNodeTextTitle] }] }),
    });
    const { gateway } = makeGateway(client);

    const all = await gateway.getHistory();
    expect(all.map((track) => track.id)).toEqual(['vid001', 'vid002']);

    const limited = await gateway.getHistory({ limit: 1 });
    expect(limited.map((track) => track.id)).toEqual(['vid001']);
  });
});

describe('playlist management', () => {
  it('creates a playlist then fetches the populated result', async () => {
    const create = vi.fn(async () => ({ playlist_id: 'PLnew' }));
    const getPlaylist = vi.fn(async () => playlistPageFixture);
    const client = makeClient({ playlistCreate: create, getPlaylist });
    const { gateway } = makeGateway(client);

    const playlist = await gateway.createPlaylist({ title: 'RoadTrip' });
    expect(create).toHaveBeenCalledWith('RoadTrip', []);
    expect(getPlaylist).toHaveBeenCalledWith('PLnew');
    expect(playlist.id).toBe('PLnew');
    expect(playlist.title).toBe('RoadTrip');
  });

  it('raises API_UNEXPECTED_RESPONSE when creation returns no id', async () => {
    const client = makeClient({ playlistCreate: async () => ({}) });
    const { gateway } = makeGateway(client);

    await expect(gateway.createPlaylist({ title: 'RoadTrip' })).rejects.toMatchObject({
      code: 'API_UNEXPECTED_RESPONSE',
    });
  });

  it('renames and deletes playlists', async () => {
    const client = makeClient();
    const { gateway } = makeGateway(client);
    const id = PlaylistIdSchema.parse('PLxyz');

    await gateway.renamePlaylist(id, 'New name');
    expect(client.playlist.setName).toHaveBeenCalledWith('PLxyz', 'New name');

    await gateway.deletePlaylist(id);
    expect(client.playlist.delete).toHaveBeenCalledWith('PLxyz');
  });

  it('adds tracks by video id', async () => {
    const client = makeClient();
    const { gateway } = makeGateway(client);

    await gateway.addTracksToPlaylist(PlaylistIdSchema.parse('PLxyz'), [
      VideoIdSchema.parse('vid001'),
      VideoIdSchema.parse('vid002'),
    ]);
    expect(client.playlist.addVideos).toHaveBeenCalledWith('PLxyz', ['vid001', 'vid002']);
  });

  it('removes tracks with useSetVideoIds=true', async () => {
    const client = makeClient();
    const { gateway } = makeGateway(client);

    await gateway.removeTracksFromPlaylist(PlaylistIdSchema.parse('PLxyz'), ['SV_abc123']);
    expect(client.playlist.removeVideos).toHaveBeenCalledWith('PLxyz', ['SV_abc123'], true);
  });
});

describe('error normalization and retry', () => {
  it('retries rate-limited requests then surfaces API_RATE_LIMITED', async () => {
    const search = vi.fn(() => Promise.reject(new Error('Request failed with status code 429')));
    const client = makeClient({ search });
    const { gateway } = makeGateway(client);

    await expect(gateway.search('coldplay', null)).rejects.toMatchObject({
      code: 'API_RATE_LIMITED',
    });
    // attempts: 2 → one initial try + one retry.
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('recovers when a transient failure is followed by success', async () => {
    const search = vi
      .fn<(query: string, filters?: { type?: string }) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('Request failed with status code 503'))
      .mockResolvedValueOnce({ contents: [{ contents: [trackNode] }], has_continuation: false });
    const client = makeClient({ search });
    const { gateway } = makeGateway(client);

    const results = await gateway.search('coldplay', 'songs');
    expect(results.tracks.map((track) => track.id)).toEqual(['vid001']);
    expect(search).toHaveBeenCalledTimes(2);
  });
});
