import { render } from 'ink';
import React from 'react';
import type { Command } from 'commander';

import { loadLiveQueue, type ContextFactory } from '@/commands/helpers';
import { printLine } from '@/cli/output';
import { App } from '@/cli/tui';
import { ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';

/** Registers the `tui` command (full-screen terminal UI). */
export function registerTuiCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('tui')
    .description('Open the full-screen terminal UI')
    .action(async () => {
      if (process.stdout.isTTY !== true) {
        throw new ValidationError('The TUI needs an interactive terminal (stdout is not a TTY)');
      }
      const context = await getContext();
      loadLiveQueue(context);
      const playback = context.container.resolve(Tokens.PlaybackService);
      const queueService = context.container.resolve(Tokens.QueueService);
      const searchService = context.container.resolve(Tokens.SearchService);

      const { waitUntilExit } = render(
        React.createElement(App, { playback, queueService, searchService }),
      );
      await waitUntilExit();
      // Playback keeps running (mpv is resident); only the queue is kept.
      queueService.persist();
      printLine('Playback continues in the background — `ytmusic stop` to stop it.');
    });
}
