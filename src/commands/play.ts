import type { Command } from 'commander';

import { searchAndPickTrack, type ContextFactory } from '@/commands/helpers';
import { printSuccess, printWarning } from '@/cli/output';
import { trackLabel } from '@/cli/ui/format';
import { withSpinner } from '@/cli/ui/spinner';
import { Tokens } from '@/core/tokens';

/** Registers the `play` command. */
export function registerPlayCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('play')
    .argument('<query>', 'song to play, e.g. "Fix You"')
    .option('--shuffle', 'shuffle the queue seeded from the search results')
    .description('Search for a song and play it (remaining results become the queue)')
    .action(async (query: string, options: { shuffle?: boolean }) => {
      const context = await getContext();
      const search = await searchAndPickTrack(context, query);
      if (search === null) {
        printWarning(`No tracks found for "${query}"`);
        return;
      }
      const queueTracks = [
        search.picked,
        ...search.results.filter((track) => track.id !== search.picked.id),
      ];
      const playback = context.container.resolve(Tokens.PlaybackService);
      const queueService = context.container.resolve(Tokens.QueueService);
      await withSpinner(`Starting ${trackLabel(search.picked)}…`, () =>
        playback.playTracks(queueTracks),
      );
      if (options.shuffle === true) {
        queueService.setShuffle(true);
      }
      queueService.persist();
      printSuccess(`Now playing: ${trackLabel(search.picked)}`);
    });
}
