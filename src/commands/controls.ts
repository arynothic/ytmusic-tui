import type { Command } from 'commander';

import { loadLiveQueue, type ContextFactory } from '@/commands/helpers';
import { printLine, printSuccess, printWarning } from '@/cli/output';
import { trackLabel } from '@/cli/ui/format';
import { ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';

/** Registers the playback control commands (pause/resume/stop/next/previous/volume/seek). */
export function registerControlCommands(program: Command, getContext: ContextFactory): void {
  program
    .command('pause')
    .description('Pause playback')
    .action(async () => {
      const context = await getContext();
      await context.container.resolve(Tokens.PlaybackService).pause();
      printSuccess('Paused');
    });

  program
    .command('resume')
    .description('Resume playback')
    .action(async () => {
      const context = await getContext();
      await context.container.resolve(Tokens.PlaybackService).resume();
      printSuccess('Resumed');
    });

  program
    .command('stop')
    .description('Stop playback')
    .action(async () => {
      const context = await getContext();
      await context.container.resolve(Tokens.PlaybackService).stop();
      printSuccess('Stopped');
    });

  program
    .command('next')
    .description('Play the next queued track')
    .action(async () => {
      const context = await getContext();
      loadLiveQueue(context);
      const playback = context.container.resolve(Tokens.PlaybackService);
      const track = await playback.next();
      const queueService = context.container.resolve(Tokens.QueueService);
      queueService.persist();
      if (track === null) {
        printWarning('End of the queue');
        return;
      }
      printSuccess(`Now playing: ${trackLabel(track)}`);
    });

  program
    .command('previous')
    .alias('prev')
    .description('Play the previous queued track')
    .action(async () => {
      const context = await getContext();
      loadLiveQueue(context);
      const playback = context.container.resolve(Tokens.PlaybackService);
      const track = await playback.previous();
      const queueService = context.container.resolve(Tokens.QueueService);
      queueService.persist();
      if (track === null) {
        printWarning('The queue is empty');
        return;
      }
      printSuccess(`Now playing: ${trackLabel(track)}`);
    });

  program
    .command('volume')
    .argument('<level>', 'volume 0-100')
    .description('Set the playback volume')
    .action(async (level: string) => {
      const volume = Number.parseInt(level, 10);
      if (Number.isNaN(volume) || volume < 0 || volume > 100) {
        throw new ValidationError(`Invalid volume "${level}": expected 0-100`);
      }
      const context = await getContext();
      await context.container.resolve(Tokens.PlaybackService).setVolume(volume);
      await context.configService.set('player.volume', String(volume));
      printSuccess(`Volume: ${String(volume)}`);
    });

  program
    .command('seek')
    .argument('<seconds>', 'absolute position in seconds')
    .description('Seek within the current track')
    .action(async (seconds: string) => {
      const position = Number.parseFloat(seconds);
      if (Number.isNaN(position) || position < 0) {
        throw new ValidationError(`Invalid position "${seconds}"`);
      }
      const context = await getContext();
      await context.container.resolve(Tokens.PlaybackService).seekTo(position);
      printLine(`Seeking to ${seconds}s`);
    });
}
