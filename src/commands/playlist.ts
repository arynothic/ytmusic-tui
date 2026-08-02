import type { Command } from 'commander';

import type { AppContext } from '@/cli/context';
import { requireAuth, searchAndPickTrack, type ContextFactory } from '@/commands/helpers';
import { printKeyValues, printLine, printSuccess, printWarning } from '@/cli/output';
import { withSpinner } from '@/cli/ui/spinner';
import { printPlaylistsTable, printTracksTable } from '@/cli/ui/table';
import { ApiError, AppError, ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';

/** Registers the `playlist` command group. */
export function registerPlaylistCommand(program: Command, getContext: ContextFactory): void {
  const playlist = program.command('playlist').description('Manage your playlists');

  playlist
    .command('list')
    .alias('ls')
    .description('List your playlists')
    .action(async () => {
      const context = await getContext();
      await requireAuth(context);
      const library = context.container.resolve(Tokens.LibraryService);
      const playlists = await withSpinner('Loading playlists…', () => library.getPlaylists());
      if (playlists.length === 0) {
        printWarning('Your library has no playlists');
        return;
      }
      printPlaylistsTable(playlists);
    });

  playlist
    .command('show')
    .argument('<idOrTitle>', 'playlist id or exact title')
    .description('Show a playlist with its tracks')
    .action(async (idOrTitle: string) => {
      const context = await getContext();
      await requireAuth(context);
      const id = await resolvePlaylistId(context, idOrTitle);
      const service = context.container.resolve(Tokens.PlaylistService);
      const details = await withSpinner('Loading playlist…', () => service.get(id));
      printLine('');
      printKeyValues({
        Playlist: details.title,
        Tracks: String(details.trackCount),
        Id: details.id,
      });
      printLine('');
      printTracksTable(details.tracks);
    });

  playlist
    .command('create')
    .argument('<title>', 'playlist title')
    .description('Create a new playlist')
    .action(async (title: string) => {
      const context = await getContext();
      await requireAuth(context);
      const service = context.container.resolve(Tokens.PlaylistService);
      const created = await withSpinner(`Creating "${title}"…`, () => service.create({ title }));
      printSuccess(`Created playlist "${created.title}" (${created.id})`);
    });

  playlist
    .command('rename')
    .argument('<idOrTitle>', 'playlist id or exact title')
    .argument('<title>', 'new title')
    .description('Rename a playlist')
    .action(async (idOrTitle: string, title: string) => {
      const context = await getContext();
      await requireAuth(context);
      const id = await resolvePlaylistId(context, idOrTitle);
      const service = context.container.resolve(Tokens.PlaylistService);
      await service.rename(id, title);
      printSuccess(`Renamed playlist to "${title}"`);
    });

  playlist
    .command('delete')
    .argument('<idOrTitle>', 'playlist id or exact title')
    .description('Delete a playlist')
    .action(async (idOrTitle: string) => {
      const context = await getContext();
      await requireAuth(context);
      const id = await resolvePlaylistId(context, idOrTitle);
      const service = context.container.resolve(Tokens.PlaylistService);
      await service.delete(id);
      printSuccess('Playlist deleted');
    });

  playlist
    .command('add')
    .argument('<idOrTitle>', 'playlist id or exact title')
    .argument('<query>', 'song to add (searched)')
    .description('Add a track to a playlist')
    .action(async (idOrTitle: string, query: string) => {
      const context = await getContext();
      await requireAuth(context);
      const id = await resolvePlaylistId(context, idOrTitle);
      const search = await searchAndPickTrack(context, query);
      if (search === null) {
        printWarning(`No tracks found for "${query}"`);
        return;
      }
      const service = context.container.resolve(Tokens.PlaylistService);
      await service.addTracks(id, [search.picked.id]);
      printSuccess(`Added "${search.picked.title}" to the playlist`);
    });

  playlist
    .command('remove')
    .argument('<idOrTitle>', 'playlist id or exact title')
    .argument('<index>', 'track number within the playlist (see playlist show)')
    .description('Remove a track from a playlist')
    .action(async (idOrTitle: string, index: string) => {
      const context = await getContext();
      await requireAuth(context);
      const id = await resolvePlaylistId(context, idOrTitle);
      const service = context.container.resolve(Tokens.PlaylistService);
      const details = await service.get(id);
      const position = Number.parseInt(index, 10);
      const track = details.tracks[position - 1];
      if (Number.isNaN(position) || track === undefined) {
        throw new ValidationError(
          `Invalid track number "${index}" (playlist has ${String(details.tracks.length)} tracks)`,
        );
      }
      if (track.setVideoId === undefined) {
        throw new ValidationError(`Track "${track.title}" cannot be removed (no entry id)`);
      }
      await service.removeTracks(id, [track.setVideoId]);
      printSuccess(`Removed "${track.title}" from the playlist`);
    });
}

/**
 * Resolves a playlist reference: tries the value as a playlist id,
 * then falls back to an exact/fuzzy title match within the library.
 */
async function resolvePlaylistId(context: AppContext, idOrTitle: string): Promise<string> {
  const service = context.container.resolve(Tokens.PlaylistService);
  try {
    const details = await service.get(idOrTitle);
    return details.id;
  } catch (error) {
    const fallbackable =
      error instanceof ApiError ||
      (error instanceof AppError && error.code === 'VALIDATION_FAILED');
    if (!fallbackable) {
      throw error;
    }
  }
  const library = context.container.resolve(Tokens.LibraryService);
  const playlists = await library.getPlaylists();
  const needle = idOrTitle.toLowerCase();
  const match =
    playlists.find((candidate) => candidate.title.toLowerCase() === needle) ??
    playlists.find((candidate) => candidate.title.toLowerCase().includes(needle));
  if (match === undefined) {
    throw new ValidationError(`No playlist found for "${idOrTitle}"`);
  }
  return match.id;
}
