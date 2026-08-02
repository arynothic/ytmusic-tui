import chalk from 'chalk';
import type { Command } from 'commander';

import type { AppContext } from '@/cli/context';
import { loadLiveQueue, searchAndPickTrack, type ContextFactory } from '@/commands/helpers';
import { printLine, printWarning } from '@/cli/output';
import { withSpinner } from '@/cli/ui/spinner';
import { Tokens } from '@/core/tokens';
import type { Track } from '@/models';

/** Registers the `lyrics` command. */
export function registerLyricsCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('lyrics')
    .argument('[query]', 'song to look up; defaults to the current track')
    .description('Print lyrics for the current or searched track')
    .action(async (query?: string) => {
      const context = await getContext();
      const track = await resolveTrack(context, query);
      if (track === null) {
        printWarning(
          query === undefined
            ? 'Nothing is playing — pass a song: ytmusic lyrics "Fix You"'
            : `No tracks found for "${query}"`,
        );
        return;
      }
      const lyricsService = context.container.resolve(Tokens.LyricsService);
      const lyrics = await withSpinner(`Fetching lyrics for "${track.title}"…`, () =>
        lyricsService.getLyrics(track),
      );
      if (lyrics === null) {
        printWarning(`No lyrics found for "${track.title}"`);
        return;
      }
      printLine('');
      for (const line of lyrics.lines) {
        printLine(line.text);
      }
      printLine('');
      if (lyrics.source !== undefined) {
        printLine(chalk.dim(`Source: ${lyrics.source}`));
      }
    });
}

/** Resolves the target track: search, or the live queue's current item. */
async function resolveTrack(context: AppContext, query: string | undefined): Promise<Track | null> {
  if (query !== undefined) {
    const search = await searchAndPickTrack(context, query);
    return search?.picked ?? null;
  }
  loadLiveQueue(context);
  return context.container.resolve(Tokens.QueueService).current()?.track ?? null;
}
