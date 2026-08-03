import { z } from 'zod';

import {
  AlbumDetailsSchema,
  AlbumSchema,
  ArtistDetailsSchema,
  ArtistSchema,
  LyricsSchema,
  PlaylistDetailsSchema,
  PlaylistSchema,
  PlaylistTrackSchema,
  TrackSchema,
  type Album,
  type AlbumDetails,
  type AlbumId,
  type Artist,
  type ArtistDetails,
  type ArtistId,
  type Lyrics,
  type Playlist,
  type PlaylistDetails,
  type PlaylistId,
  type PlaylistTrack,
  type Track,
  type VideoId,
} from '@/models';
import {
  collectListItems,
  HeaderSchema,
  parseListItem,
  pickThumbnailUrl,
  readShelfItems,
  readShelfTitle,
  readText,
  ShelfSchema,
  type ListItem,
} from '@/services/gateway/loose-schemas';

/** item_type values that represent playable tracks. */
const TRACK_TYPES = new Set(['song', 'video', 'non_music_track']);
/** item_type values that represent albums. */
const ALBUM_TYPES = new Set(['album']);
/** item_type values that represent artists. */
const ARTIST_TYPES = new Set(['artist', 'library_artist']);
/** item_type values that represent playlists (podcasts surface as playlists). */
const PLAYLIST_TYPES = new Set(['playlist', 'podcast_show']);

/** Maps the artists/authors/author fields of a list item. */
function mapArtists(item: ListItem): { id?: string; name: string }[] {
  const sources = item.artists ?? item.authors ?? (item.author !== undefined ? [item.author] : []);
  return sources.flatMap((source) => {
    if (source.name === undefined || source.name === '') {
      return [];
    }
    return [
      {
        name: source.name,
        ...(source.channel_id !== undefined ? { id: source.channel_id } : {}),
      },
    ];
  });
}

/** Extracts the first 4-digit year from a text, e.g. "Album • 1987". */
function extractYear(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  return /\b(\d{4})\b/.exec(text)?.[1];
}

/** Parses a count out of display text like "50 songs" or "1,234". */
function parseCount(text: string | undefined): number | undefined {
  if (text === undefined) {
    return undefined;
  }
  const match = /(\d[\d,]*)/.exec(text);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const value = Number.parseInt(match[1].replaceAll(',', ''), 10);
  return Number.isNaN(value) ? undefined : value;
}

/** Extracts artist names from a subtitle like "Rick Astley • 1987". */
function extractArtistsFromSubtitle(subtitle: string | undefined): { name: string }[] {
  if (subtitle === undefined) {
    return [];
  }
  return subtitle
    .split('•')
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        segment !== '' &&
        !/^\d{4}$/.test(segment) &&
        !/\b(songs?|views?|plays?|albums?|singles?|eps?)\b/i.test(segment),
    )
    .map((name) => ({ name }));
}

/** True when the item carries an "Explicit" badge. */
function hasExplicitBadge(item: ListItem): boolean {
  return item.badges?.some((badge) => /explicit/i.test(badge.label ?? '')) === true;
}

/** Maps a vendor list item to a Track; undefined when it is not a track. */
export function mapTrack(node: unknown): Track | undefined {
  const item = parseListItem(node);
  if (item === undefined) {
    return undefined;
  }
  if (item.item_type !== undefined && !TRACK_TYPES.has(item.item_type)) {
    return undefined;
  }
  const id = item.id ?? item.endpoint?.payload?.videoId;
  const title = readText(item.title);
  if (id === undefined || title === undefined) {
    return undefined;
  }
  const parsed = TrackSchema.safeParse({
    id,
    title,
    artists: mapArtists(item),
    ...(item.album?.id !== undefined && item.album.name !== undefined
      ? { album: { id: item.album.id, title: item.album.name } }
      : {}),
    durationSeconds: item.duration?.seconds ?? null,
    ...(pickThumbnailUrl(item.thumbnails) !== undefined
      ? { thumbnailUrl: pickThumbnailUrl(item.thumbnails) }
      : {}),
    isVideo: item.item_type === 'video' || item.item_type === 'non_music_track',
    isExplicit: hasExplicitBadge(item),
  });
  return parsed.success ? parsed.data : undefined;
}

/** Maps a vendor list item to a PlaylistTrack (track + setVideoId). */
export function mapPlaylistTrack(node: unknown): PlaylistTrack | undefined {
  const item = parseListItem(node);
  if (item === undefined) {
    return undefined;
  }
  const track = mapTrack(node);
  if (track === undefined) {
    return undefined;
  }
  const parsed = PlaylistTrackSchema.safeParse({
    ...track,
    ...(item.set_video_id !== undefined ? { setVideoId: item.set_video_id } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

/** Maps a vendor list item to an Album summary. */
export function mapAlbum(node: unknown): Album | undefined {
  const item = parseListItem(node);
  if (item === undefined) {
    return undefined;
  }
  if (item.item_type !== undefined && !ALBUM_TYPES.has(item.item_type)) {
    return undefined;
  }
  const id = item.id ?? item.endpoint?.payload?.browseId;
  const title = readText(item.title);
  if (id === undefined || title === undefined) {
    return undefined;
  }
  const subtitleText = readText(item.subtitle);
  const parsed = AlbumSchema.safeParse({
    id,
    title,
    artists: mapArtists(item),
    ...(item.year !== undefined || extractYear(subtitleText) !== undefined
      ? { year: item.year ?? extractYear(subtitleText) }
      : {}),
    ...(pickThumbnailUrl(item.thumbnails) !== undefined
      ? { thumbnailUrl: pickThumbnailUrl(item.thumbnails) }
      : {}),
    ...(parseCount(item.item_count ?? item.song_count) !== undefined
      ? { trackCount: parseCount(item.item_count ?? item.song_count) }
      : {}),
    isSingle: subtitleText !== undefined && /single|ep/i.test(subtitleText),
  });
  return parsed.success ? parsed.data : undefined;
}

/** Maps a vendor list item to an Artist summary. */
export function mapArtist(node: unknown): Artist | undefined {
  const item = parseListItem(node);
  if (item === undefined) {
    return undefined;
  }
  if (item.item_type !== undefined && !ARTIST_TYPES.has(item.item_type)) {
    return undefined;
  }
  const name = readText(item.title);
  if (name === undefined) {
    return undefined;
  }
  const id = item.id ?? item.endpoint?.payload?.browseId;
  const parsed = ArtistSchema.safeParse({ name, ...(id !== undefined ? { id } : {}) });
  return parsed.success ? parsed.data : undefined;
}

/** Maps a vendor list item to a Playlist summary. */
export function mapPlaylist(node: unknown): Playlist | undefined {
  const item = parseListItem(node);
  if (item === undefined) {
    return undefined;
  }
  if (item.item_type !== undefined && !PLAYLIST_TYPES.has(item.item_type)) {
    return undefined;
  }
  const id = item.id ?? item.endpoint?.payload?.browseId;
  const title = readText(item.title);
  if (id === undefined || title === undefined) {
    return undefined;
  }
  const parsed = PlaylistSchema.safeParse({
    id,
    title,
    ...(item.author?.name !== undefined ? { author: item.author.name } : {}),
    ...(parseCount(item.item_count ?? item.song_count ?? readText(item.subtitle)) !== undefined
      ? { trackCount: parseCount(item.item_count ?? item.song_count ?? readText(item.subtitle)) }
      : {}),
    ...(pickThumbnailUrl(item.thumbnails) !== undefined
      ? { thumbnailUrl: pickThumbnailUrl(item.thumbnails) }
      : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

const DetailPageSchema = z.object({
  header: HeaderSchema.optional(),
  contents: z.array(z.unknown()).optional(),
  sections: z.array(z.unknown()).optional(),
});

/** Maps an album detail page to AlbumDetails. */
export function mapAlbumDetails(albumId: AlbumId, response: unknown): AlbumDetails | undefined {
  const parsed = DetailPageSchema.safeParse(response);
  if (!parsed.success) {
    return undefined;
  }
  const header = parsed.data.header ?? {};
  const title = readText(header.title);
  if (title === undefined) {
    return undefined;
  }
  const subtitleText = readText(header.subtitle);
  const tracks = collectListItems(parsed.data.contents ?? [])
    .map(mapTrack)
    .filter((track): track is Track => track !== undefined);
  const result = AlbumDetailsSchema.safeParse({
    id: albumId,
    title,
    artists: extractArtistsFromSubtitle(subtitleText),
    ...(extractYear(subtitleText) !== undefined ? { year: extractYear(subtitleText) } : {}),
    ...(readText(header.description) !== undefined
      ? { description: readText(header.description) }
      : {}),
    ...(pickThumbnailUrl(header.thumbnails) !== undefined
      ? { thumbnailUrl: pickThumbnailUrl(header.thumbnails) }
      : {}),
    isSingle: subtitleText !== undefined && /single|ep/i.test(subtitleText),
    tracks,
    trackCount: tracks.length,
  });
  return result.success ? result.data : undefined;
}

/** Maps an artist detail page to ArtistDetails. */
export function mapArtistDetails(artistId: ArtistId, response: unknown): ArtistDetails | undefined {
  const parsed = DetailPageSchema.safeParse(response);
  if (!parsed.success) {
    return undefined;
  }
  const header = parsed.data.header ?? {};
  const name = readText(header.title);
  if (name === undefined) {
    return undefined;
  }
  const topTracks: Track[] = [];
  const albums: Album[] = [];
  const singles: Album[] = [];
  for (const sectionNode of parsed.data.sections ?? []) {
    const section = ShelfSchema.safeParse(sectionNode);
    if (!section.success) {
      continue;
    }
    const sectionTitle = readShelfTitle(section.data) ?? '';
    const items = readShelfItems(section.data);
    if (/song/i.test(sectionTitle)) {
      topTracks.push(...items.map(mapTrack).filter((track): track is Track => track !== undefined));
    } else if (/album/i.test(sectionTitle)) {
      albums.push(...items.map(mapAlbum).filter((album): album is Album => album !== undefined));
    } else if (/single|ep/i.test(sectionTitle)) {
      singles.push(...items.map(mapAlbum).filter((album): album is Album => album !== undefined));
    }
  }
  const subscriberCount =
    readText(header.subscribers) ?? readText(header.subtitle)?.match(/[\d.,KM]+ subscribers?/)?.[0];
  const result = ArtistDetailsSchema.safeParse({
    id: artistId,
    name,
    ...(readText(header.description) !== undefined
      ? { description: readText(header.description) }
      : {}),
    ...(subscriberCount !== undefined ? { subscriberCount } : {}),
    ...(pickThumbnailUrl(header.thumbnails) !== undefined
      ? { thumbnailUrl: pickThumbnailUrl(header.thumbnails) }
      : {}),
    topTracks,
    albums,
    singles,
  });
  return result.success ? result.data : undefined;
}

/** Maps a playlist detail page to PlaylistDetails. */
export function mapPlaylistDetails(
  playlistId: PlaylistId,
  response: unknown,
): PlaylistDetails | undefined {
  const parsed = DetailPageSchema.safeParse(response);
  if (!parsed.success) {
    return undefined;
  }
  const header = parsed.data.header ?? {};
  const title = readText(header.title);
  if (title === undefined) {
    return undefined;
  }
  const tracks = collectListItems(parsed.data.contents ?? [])
    .map(mapPlaylistTrack)
    .filter((track): track is PlaylistTrack => track !== undefined);
  const result = PlaylistDetailsSchema.safeParse({
    id: playlistId,
    title,
    ...(readText(header.description) !== undefined
      ? { description: readText(header.description) }
      : {}),
    ...(pickThumbnailUrl(header.thumbnails) !== undefined
      ? { thumbnailUrl: pickThumbnailUrl(header.thumbnails) }
      : {}),
    tracks,
    trackCount: tracks.length,
  });
  return result.success ? result.data : undefined;
}

const LRC_LINE_PATTERN = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s?(.*)$/;

/**
 * Splits raw lyrics text into lines, detecting LRC-style `[mm:ss.xx]`
 * timestamps when present (enabling synchronized display).
 */
export function parseLyricsText(text: string): {
  lines: { text: string; startMs: number | null }[];
  hasTimestamps: boolean;
} {
  const lines = text.split(/\r?\n/).map((line) => {
    const match = LRC_LINE_PATTERN.exec(line);
    if (match === null || match[1] === undefined || match[2] === undefined) {
      return { text: line, startMs: null };
    }
    const minutes = Number.parseInt(match[1], 10);
    const seconds = Number.parseInt(match[2], 10);
    const fraction = match[3];
    const fractionMs =
      fraction === undefined ? 0 : Number.parseInt(fraction.padEnd(3, '0').slice(0, 3), 10);
    return { text: match[4] ?? '', startMs: (minutes * 60 + seconds) * 1000 + fractionMs };
  });
  return { lines, hasTimestamps: lines.some((line) => line.startMs !== null) };
}

/** Maps a lyrics shelf response to Lyrics; null when no lyrics exist. */
export function mapLyrics(trackId: VideoId, shelf: unknown): Lyrics | null {
  if (shelf === undefined || shelf === null) {
    return null;
  }
  const parsed = z
    .object({ description: z.unknown().optional(), footer: z.unknown().optional() })
    .safeParse(shelf);
  if (!parsed.success) {
    return null;
  }
  const text = readText(parsed.data.description);
  if (text === undefined) {
    return null;
  }
  const { lines, hasTimestamps } = parseLyricsText(text);
  const source = readText(parsed.data.footer);
  const result = LyricsSchema.safeParse({
    trackId,
    lines,
    hasTimestamps,
    ...(source !== undefined ? { source } : {}),
  });
  return result.success ? result.data : null;
}

/** Maps a TrackInfo response (music.getInfo) to a Track. */
export function mapTrackInfo(response: unknown): Track | undefined {
  const parsed = z
    .object({
      basic_info: z
        .object({
          id: z.string().optional(),
          title: z.string().optional(),
          author: z.string().optional(),
          channel_id: z.string().optional(),
          duration: z.number().optional(),
          thumbnail: z.unknown().optional(),
        })
        .optional(),
    })
    .safeParse(response);
  if (!parsed.success || parsed.data.basic_info === undefined) {
    return undefined;
  }
  const info = parsed.data.basic_info;
  if (info.id === undefined || info.title === undefined) {
    return undefined;
  }
  const result = TrackSchema.safeParse({
    id: info.id,
    title: info.title,
    artists:
      info.author !== undefined
        ? [{ name: info.author, ...(info.channel_id !== undefined ? { id: info.channel_id } : {}) }]
        : [],
    durationSeconds: info.duration ?? null,
    ...(pickThumbnailUrl(info.thumbnail) !== undefined
      ? { thumbnailUrl: pickThumbnailUrl(info.thumbnail) }
      : {}),
    isVideo: false,
    isExplicit: false,
  });
  return result.success ? result.data : undefined;
}
