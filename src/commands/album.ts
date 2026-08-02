import type { Command } from 'commander';

import type { ContextFactory } from '@/commands/helpers';
import { printKeyValues, printLine, printWarning } from '@/cli/output';
import { pickItem } from '@/cli/ui/pick';
import { withSpinner } from '@/cli/ui/spinner';
import { printTracksTable } from '@/cli/ui/table';
import { Tokens } from '@/core/tokens';

/** Registers the `album` command. */
export function registerAlbumCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('album')
    .argument('<name>', 'album name, e.g. "Parachutes"')
    .description('Show an album with its tracks')
    .action(async (name: string) => {
      const context = await getContext();
      const gateway = context.container.resolve(Tokens.MusicGateway);

      const results = await withSpinner(`Searching for "${name}"…`, () =>
        gateway.search(name, 'albums', { limit: 5 }),
      );
      const album = await pickItem(results.albums, {
        message: 'Pick an album',
        label: (candidate) =>
          `${candidate.title} — ${candidate.artists.map((artist) => artist.name).join(', ')}`,
      });
      if (album === null) {
        printWarning(`No albums found for "${name}"`);
        return;
      }

      const details = await withSpinner(`Loading ${album.title}…`, () =>
        gateway.getAlbum(album.id),
      );
      printLine('');
      printKeyValues({
        Album: details.title,
        Artist: details.artists.map((artist) => artist.name).join(', ') || '—',
        ...(details.year !== undefined ? { Year: details.year } : {}),
        Tracks: String(details.trackCount),
      });
      printLine('');
      printTracksTable(details.tracks);
      printLine('');
      printLine(`Play it: ytmusic play "${details.title}"`);
    });
}
