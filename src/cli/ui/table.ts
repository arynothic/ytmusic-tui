import chalk from 'chalk';
import Table from 'cli-table3';

import { printLine } from '@/cli/output';
import { artistNames, trackDuration, truncate } from '@/cli/ui/format';
import { highlightMatches } from '@/cli/ui/highlight';
import type { Album, Artist, Playlist, Queue, Track } from '@/models';

/** Options shared by the table printers. */
export interface TableOptions {
  /** Search terms to highlight in title cells. */
  readonly query?: string;
  /** First row number (1-based); defaults to 1. */
  readonly startIndex?: number;
}

const TABLE_STYLE = { head: ['cyan'] as string[], border: ['dim'] as string[] };
const MAX_TITLE_WIDTH = 42;

/** Applies query highlighting when a query is present. */
function maybeHighlight(text: string, query: string | undefined): string {
  return query === undefined ? text : highlightMatches(text, query);
}

/** Prints a numbered track table: title, artist, album, duration, flags. */
export function printTracksTable(tracks: readonly Track[], options: TableOptions = {}): void {
  const start = options.startIndex ?? 1;
  const table = new Table({
    head: ['#', 'Title', 'Artist', 'Album', 'Time'],
    style: TABLE_STYLE,
    colAligns: ['right', 'left', 'left', 'left', 'right'],
  });
  tracks.forEach((track, index) => {
    const flags = `${track.isExplicit ? chalk.red(' E') : ''}${track.isVideo ? chalk.blue(' V') : ''}`;
    table.push([
      String(start + index),
      `${truncate(maybeHighlight(track.title, options.query), MAX_TITLE_WIDTH)}${flags}`,
      truncate(maybeHighlight(artistNames(track), options.query), 24),
      truncate(track.album?.title ?? '—', 24),
      trackDuration(track),
    ]);
  });
  printLine(table.toString());
}

/** Prints a numbered album table. */
export function printAlbumsTable(albums: readonly Album[], options: TableOptions = {}): void {
  const start = options.startIndex ?? 1;
  const table = new Table({
    head: ['#', 'Album', 'Artist', 'Year', 'Tracks'],
    style: TABLE_STYLE,
    colAligns: ['right', 'left', 'left', 'right', 'right'],
  });
  albums.forEach((album, index) => {
    table.push([
      String(start + index),
      truncate(maybeHighlight(album.title, options.query), MAX_TITLE_WIDTH),
      truncate(album.artists.map((artist) => artist.name).join(', ') || '—', 24),
      album.year ?? '—',
      album.trackCount !== undefined ? String(album.trackCount) : '—',
    ]);
  });
  printLine(table.toString());
}

/** Prints a numbered artist table. */
export function printArtistsTable(artists: readonly Artist[], options: TableOptions = {}): void {
  const start = options.startIndex ?? 1;
  const table = new Table({ head: ['#', 'Artist'], style: TABLE_STYLE });
  artists.forEach((artist, index) => {
    table.push([String(start + index), maybeHighlight(artist.name, options.query)]);
  });
  printLine(table.toString());
}

/** Prints a numbered playlist table. */
export function printPlaylistsTable(
  playlists: readonly Playlist[],
  options: TableOptions = {},
): void {
  const start = options.startIndex ?? 1;
  const table = new Table({
    head: ['#', 'Playlist', 'Author', 'Tracks', 'Id'],
    style: TABLE_STYLE,
    colAligns: ['right', 'left', 'left', 'right', 'left'],
  });
  playlists.forEach((playlist, index) => {
    table.push([
      String(start + index),
      truncate(maybeHighlight(playlist.title, options.query), MAX_TITLE_WIDTH),
      truncate(playlist.author ?? '—', 20),
      playlist.trackCount !== undefined ? String(playlist.trackCount) : '—',
      chalk.dim(playlist.id),
    ]);
  });
  printLine(table.toString());
}

/** Prints the live queue with a ▶ marker on the current item. */
export function printQueueTable(queue: Queue): void {
  const table = new Table({
    head: ['', '#', 'Title', 'Artist', 'Time'],
    style: TABLE_STYLE,
    colAligns: ['left', 'right', 'left', 'left', 'right'],
  });
  queue.items.forEach((item, index) => {
    const isCurrent = index === queue.currentIndex;
    const title = truncate(item.track.title, MAX_TITLE_WIDTH);
    table.push([
      isCurrent ? chalk.green('▶') : '',
      String(index + 1),
      isCurrent ? chalk.green(title) : title,
      truncate(artistNames(item.track), 24),
      trackDuration(item.track),
    ]);
  });
  printLine(table.toString());
  const flags = [
    `shuffle ${queue.shuffle ? chalk.green('on') : chalk.dim('off')}`,
    `repeat ${queue.repeat === 'off' ? chalk.dim('off') : chalk.green(queue.repeat)}`,
  ];
  printLine(chalk.dim(flags.join('  ·  ')));
}

/** Prints a section heading between tables. */
export function printSection(title: string): void {
  printLine('');
  printLine(chalk.bold.underline(title));
}
