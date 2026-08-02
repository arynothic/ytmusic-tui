import type { Command } from 'commander';

import type { ContextFactory } from '@/commands/helpers';
import { printKeyValues, printLine, printWarning } from '@/cli/output';
import { pickItem } from '@/cli/ui/pick';
import { withSpinner } from '@/cli/ui/spinner';
import { printAlbumsTable, printSection, printTracksTable } from '@/cli/ui/table';
import { ApiError } from '@/core/errors';
import { Tokens } from '@/core/tokens';

/** Registers the `artist` command. */
export function registerArtistCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('artist')
    .argument('<name>', 'artist name, e.g. "Coldplay"')
    .description('Show an artist page: top songs, albums and singles')
    .action(async (name: string) => {
      const context = await getContext();
      const gateway = context.container.resolve(Tokens.MusicGateway);

      const results = await withSpinner(`Searching for "${name}"…`, () =>
        gateway.search(name, 'artists', { limit: 5 }),
      );
      const artist = await pickItem(results.artists, {
        message: 'Pick an artist',
        label: (candidate) => candidate.name,
      });
      if (artist === null) {
        printWarning(`No artists found for "${name}"`);
        return;
      }
      const artistId = artist.id;
      if (artistId === undefined) {
        throw new ApiError(
          'API_UNEXPECTED_RESPONSE',
          `The artist "${artist.name}" has no browsable page`,
        );
      }

      const details = await withSpinner(`Loading ${artist.name}…`, () =>
        gateway.getArtist(artistId),
      );
      printLine('');
      printKeyValues({
        Artist: details.name,
        ...(details.subscriberCount !== undefined ? { Subscribers: details.subscriberCount } : {}),
        ...(details.description !== undefined ? { About: details.description } : {}),
      });
      if (details.topTracks.length > 0) {
        printSection('Top songs');
        printTracksTable(details.topTracks.slice(0, 10));
      }
      if (details.albums.length > 0) {
        printSection('Albums');
        printAlbumsTable(details.albums.slice(0, 10));
      }
      if (details.singles.length > 0) {
        printSection('Singles & EPs');
        printAlbumsTable(details.singles.slice(0, 10));
      }
    });
}
