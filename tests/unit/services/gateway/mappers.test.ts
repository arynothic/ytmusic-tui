import { describe, expect, it } from 'vitest';

import { VideoIdSchema } from '@/models';
import { collectListItems, readText } from '@/services/gateway/loose-schemas';
import {
  mapAlbum,
  mapAlbumDetails,
  mapArtist,
  mapArtistDetails,
  mapLyrics,
  mapPlaylist,
  mapPlaylistDetails,
  mapPlaylistTrack,
  mapTrack,
  mapTrackInfo,
  parseLyricsText,
} from '@/services/gateway/mappers';

import {
  albumNode,
  albumPageFixture,
  artistNode,
  artistPageFixture,
  playlistNode,
  playlistPageFixture,
  playlistTrackNode,
  podcastNode,
  trackInfoFixture,
  trackNode,
  trackNodeTextTitle,
  videoNode,
} from './fixtures';

describe('readText', () => {
  it('reads plain strings, Text nodes and runs', () => {
    expect(readText('hello')).toBe('hello');
    expect(readText({ text: 'world' })).toBe('world');
    expect(readText({ runs: [{ text: 'foo' }, { text: 'bar' }] })).toBe('foobar');
    expect(readText(undefined)).toBeUndefined();
    expect(readText('')).toBeUndefined();
    expect(readText(42)).toBeUndefined();
  });
});

describe('mapTrack', () => {
  it('maps a full song node', () => {
    const track = mapTrack(trackNode);
    expect(track?.id).toBe('vid001');
    expect(track?.title).toBe('Fix You');
    expect(track?.artists[0]).toEqual({ name: 'Coldplay', id: 'UCcold' });
    expect(track?.album).toEqual({ id: 'MPREb_xy', title: 'X&Y' });
    expect(track?.durationSeconds).toBe(295);
    expect(track?.thumbnailUrl).toBe('https://img/large.jpg');
    expect(track?.isVideo).toBe(false);
  });

  it('reads Text-node titles and video flags', () => {
    expect(mapTrack(trackNodeTextTitle)?.title).toBe('The Scientist');
    expect(mapTrack(videoNode)?.isVideo).toBe(true);
  });

  it('falls back to endpoint videoId', () => {
    const node = { title: 'Song', endpoint: { payload: { videoId: 'vid999' } } };
    expect(mapTrack(node)?.id).toBe('vid999');
    expect(mapTrack(node)?.durationSeconds).toBeNull();
  });

  it('detects explicit badges', () => {
    const node = { ...trackNode, badges: [{ label: 'Explicit' }] };
    expect(mapTrack(node)?.isExplicit).toBe(true);
  });

  it('drops non-tracks and unusable nodes', () => {
    expect(mapTrack(albumNode)).toBeUndefined();
    expect(mapTrack(artistNode)).toBeUndefined();
    expect(mapTrack({ title: 'no id' })).toBeUndefined();
    expect(mapTrack('garbage')).toBeUndefined();
    expect(mapTrack({ ...trackNode, title: '' })).toBeUndefined();
  });
});

describe('mapPlaylistTrack', () => {
  it('carries the setVideoId', () => {
    expect(mapPlaylistTrack(playlistTrackNode)?.setVideoId).toBe('SV_abc123');
    expect(mapPlaylistTrack(trackNodeTextTitle)?.setVideoId).toBeUndefined();
  });
});

describe('mapAlbum / mapArtist / mapPlaylist', () => {
  it('maps an album with year extracted from the subtitle', () => {
    const album = mapAlbum(albumNode);
    expect(album?.title).toBe('X&Y');
    expect(album?.year).toBe('2005');
    expect(album?.thumbnailUrl).toBe('https://img/album.jpg');
  });

  it('maps an artist summary', () => {
    const artist = mapArtist(artistNode);
    expect(artist).toEqual({ id: 'UCcold', name: 'Coldplay' });
  });

  it('maps a playlist with parsed track count', () => {
    const playlist = mapPlaylist(playlistNode);
    expect(playlist?.title).toBe('RoadTrip');
    expect(playlist?.trackCount).toBe(42);
    expect(playlist?.author).toBe('Ada');
  });

  it('maps podcast shows as playlists', () => {
    expect(mapPlaylist(podcastNode)?.id).toBe('PLpod');
  });

  it('drops mismatched categories', () => {
    expect(mapAlbum(trackNode)).toBeUndefined();
    expect(mapArtist(trackNode)).toBeUndefined();
    expect(mapPlaylist(trackNode)).toBeUndefined();
  });
});

describe('detail mappers', () => {
  it('maps an album page', () => {
    const album = mapAlbumDetails(albumNode.id as never, albumPageFixture);
    expect(album?.title).toBe('X&Y');
    expect(album?.year).toBe('2005');
    expect(album?.artists[0]?.name).toBe('Coldplay');
    expect(album?.tracks).toHaveLength(2);
    expect(album?.description).toBe('Third studio album.');
  });

  it('maps an artist page with categorized sections', () => {
    const artist = mapArtistDetails(artistNode.id as never, artistPageFixture);
    expect(artist?.name).toBe('Coldplay');
    expect(artist?.subscriberCount).toBe('25.4M subscribers');
    expect(artist?.topTracks).toHaveLength(1);
    expect(artist?.albums).toHaveLength(1);
    expect(artist?.singles).toHaveLength(1);
  });

  it('maps a playlist page preserving setVideoIds', () => {
    const playlist = mapPlaylistDetails(playlistNode.id as never, playlistPageFixture);
    expect(playlist?.title).toBe('RoadTrip');
    expect(playlist?.tracks).toHaveLength(2);
    expect(playlist?.tracks[0]?.setVideoId).toBe('SV_abc123');
  });

  it('returns undefined for pages without a title', () => {
    expect(mapAlbumDetails('x' as never, { header: {}, contents: [] })).toBeUndefined();
    expect(mapArtistDetails('x' as never, 'garbage')).toBeUndefined();
  });
});

describe('parseLyricsText', () => {
  it('parses plain lyrics without timestamps', () => {
    const { lines, hasTimestamps } = parseLyricsText('line one\nline two');
    expect(lines).toEqual([
      { text: 'line one', startMs: null },
      { text: 'line two', startMs: null },
    ]);
    expect(hasTimestamps).toBe(false);
  });

  it('parses LRC timestamps into milliseconds', () => {
    const { lines, hasTimestamps } = parseLyricsText('[00:12.50] first\n[01:05.123] second');
    expect(lines[0]).toEqual({ text: 'first', startMs: 12_500 });
    expect(lines[1]).toEqual({ text: 'second', startMs: 65_123 });
    expect(hasTimestamps).toBe(true);
  });

  it('handles mixed timed and untimed lines', () => {
    const { lines } = parseLyricsText('[00:01.00] timed\nuntimed');
    expect(lines[0]?.startMs).toBe(1000);
    expect(lines[1]?.startMs).toBeNull();
  });
});

describe('mapLyrics', () => {
  const trackId = VideoIdSchema.parse('vid001');

  it('maps a lyrics shelf with source attribution', () => {
    const shelf = {
      description: { text: '[00:01.00] hello\nworld' },
      footer: { text: 'Source: Musixmatch' },
    };
    const lyrics = mapLyrics(trackId, shelf);
    expect(lyrics?.hasTimestamps).toBe(true);
    expect(lyrics?.lines).toHaveLength(2);
    expect(lyrics?.source).toBe('Source: Musixmatch');
  });

  it('returns null when no lyrics exist', () => {
    expect(mapLyrics(trackId, undefined)).toBeNull();
    expect(mapLyrics(trackId, {})).toBeNull();
    expect(mapLyrics(trackId, 'garbage')).toBeNull();
  });
});

describe('mapTrackInfo', () => {
  it('maps a TrackInfo response', () => {
    const track = mapTrackInfo(trackInfoFixture);
    expect(track?.id).toBe('vid001');
    expect(track?.title).toBe('Fix You');
    expect(track?.artists[0]).toEqual({ name: 'Coldplay', id: 'UCcold' });
    expect(track?.durationSeconds).toBe(295);
  });

  it('returns undefined for unusable payloads', () => {
    expect(mapTrackInfo({})).toBeUndefined();
    expect(mapTrackInfo({ basic_info: { id: 'x' } })).toBeUndefined();
  });
});

describe('collectListItems', () => {
  it('walks nested shelves and sections', () => {
    const nested = {
      contents: [
        { contents: [trackNode] },
        { items: [albumNode] },
        { title: { text: 'not a shelf' } },
      ],
    };
    const items = collectListItems(nested);
    expect(items).toHaveLength(2);
  });

  it('collects bare item arrays', () => {
    expect(collectListItems([trackNode, artistNode])).toHaveLength(2);
  });
});
