import type { Command } from 'commander';

import type { ContextFactory } from '@/commands/helpers';
import { printSuccess } from '@/cli/output';
import { Tokens } from '@/core/tokens';

/** Registers the `cache` command group. */
export function registerCacheCommand(program: Command, getContext: ContextFactory): void {
  const cache = program.command('cache').description('Manage the local cache');

  cache
    .command('clear')
    .option('--history', 'also clear the local playback history')
    .description('Clear cached search results, metadata and stream URLs')
    .action(async (options: { history?: boolean }) => {
      const context = await getContext();
      context.container.resolve(Tokens.CacheStore).clearAll();
      if (options.history === true) {
        context.container.resolve(Tokens.LibraryService).clearLocalHistory();
        printSuccess('Cache and history cleared');
        return;
      }
      printSuccess('Cache cleared');
    });
}
