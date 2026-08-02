import chalk from 'chalk';
import type { Command } from 'commander';

import { loadLiveQueue, type ContextFactory } from '@/commands/helpers';
import { printLine } from '@/cli/output';
import { artistNames } from '@/cli/ui/format';
import { Tokens } from '@/core/tokens';
import { formatDurationSeconds } from '@/utils';

const STATUS_ICONS: Record<string, string> = {
  playing: chalk.green('▶'),
  paused: chalk.yellow('⏸'),
  stopped: chalk.dim('⏹'),
  loading: chalk.cyan('…'),
  idle: chalk.dim('■'),
};

/** Registers the `now` command ("what is playing"). */
export function registerNowCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('now')
    .description('Show the currently playing track')
    .action(async () => {
      const context = await getContext();
      loadLiveQueue(context);
      const now = await context.container.resolve(Tokens.PlaybackService).now();
      const track = now.snapshot.track ?? now.item?.track ?? null;
      if (track === null || now.snapshot.status === 'idle') {
        printLine('Nothing is playing.');
        return;
      }
      const icon = STATUS_ICONS[now.snapshot.status] ?? '';
      const position = formatDurationSeconds(now.snapshot.positionSeconds);
      const total =
        track.durationSeconds !== null ? formatDurationSeconds(track.durationSeconds) : '—';
      printLine(
        `${icon} ${chalk.bold(track.title)} — ${artistNames(track)}  ${chalk.dim(`${position} / ${total}`)}  ${chalk.dim(`vol ${String(now.snapshot.volume)}`)}`,
      );
      if (now.total > 0) {
        const flags = [
          `queue ${String(now.position)}/${String(now.total)}`,
          `shuffle ${now.shuffle ? 'on' : 'off'}`,
          `repeat ${now.repeat}`,
        ];
        printLine(chalk.dim(flags.join('  ·  ')));
      }
    });
}
