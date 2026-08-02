import type { Command } from 'commander';

import {
  loadLiveQueue,
  parseUserIndex,
  searchAndPickTrack,
  type ContextFactory,
} from '@/commands/helpers';
import { printLine, printSuccess, printWarning } from '@/cli/output';
import { trackLabel } from '@/cli/ui/format';
import { withSpinner } from '@/cli/ui/spinner';
import { printQueueTable } from '@/cli/ui/table';
import { ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';
import { RepeatModeSchema } from '@/models';

/** Registers the `queue` command group. */
export function registerQueueCommand(program: Command, getContext: ContextFactory): void {
  const queue = program.command('queue').description('Inspect and manage the play queue');

  const showQueue = async (): Promise<void> => {
    const context = await getContext();
    loadLiveQueue(context);
    const queueService = context.container.resolve(Tokens.QueueService);
    const current = queueService.getQueue();
    if (current.items.length === 0) {
      printWarning('The queue is empty. Play something first: ytmusic play "song"');
      return;
    }
    printQueueTable(current);
  };

  queue.action(showQueue);
  queue.command('show').description('Print the current queue').action(showQueue);

  queue
    .command('add')
    .argument('<query>', 'song to append (searched)')
    .description('Append a track to the queue')
    .action(async (query: string) => {
      const context = await getContext();
      loadLiveQueue(context);
      const search = await searchAndPickTrack(context, query);
      if (search === null) {
        printWarning(`No tracks found for "${query}"`);
        return;
      }
      const queueService = context.container.resolve(Tokens.QueueService);
      queueService.enqueue([search.picked]);
      queueService.persist();
      printSuccess(`Queued: ${trackLabel(search.picked)}`);
    });

  queue
    .command('remove')
    .argument('<index>', 'queue position (see ytmusic queue)')
    .description('Remove an item from the queue')
    .action(async (index: string) => {
      const context = await getContext();
      loadLiveQueue(context);
      const queueService = context.container.resolve(Tokens.QueueService);
      const item =
        queueService.getQueue().items[
          parseUserIndex(index, queueService.getQueue().items.length) ?? -1
        ];
      if (item === undefined) {
        throw new ValidationError(`Invalid queue position "${index}"`);
      }
      queueService.remove(item.id);
      queueService.persist();
      printSuccess(`Removed: ${trackLabel(item.track)}`);
    });

  queue
    .command('move')
    .argument('<from>', 'current position')
    .argument('<to>', 'target position')
    .description('Move an item within the queue')
    .action(async (from: string, to: string) => {
      const context = await getContext();
      loadLiveQueue(context);
      const queueService = context.container.resolve(Tokens.QueueService);
      const length = queueService.getQueue().items.length;
      const fromIndex = parseUserIndex(from, length);
      const toIndex = parseUserIndex(to, length);
      const item = queueService.getQueue().items[fromIndex ?? -1];
      if (fromIndex === null || toIndex === null || item === undefined) {
        throw new ValidationError(
          `Invalid positions "${from}" / "${to}" (queue has ${String(length)} items)`,
        );
      }
      queueService.move(item.id, toIndex);
      queueService.persist();
      printSuccess(`Moved "${item.track.title}" to position ${String(toIndex + 1)}`);
    });

  queue
    .command('clear')
    .description('Clear the queue')
    .action(async () => {
      const context = await getContext();
      const queueService = context.container.resolve(Tokens.QueueService);
      queueService.clear();
      queueService.persist();
      printSuccess('Queue cleared');
    });

  queue
    .command('shuffle')
    .argument('[state]', 'on or off; toggles when omitted')
    .description('Toggle or set shuffle')
    .action(async (state?: string) => {
      const context = await getContext();
      loadLiveQueue(context);
      const queueService = context.container.resolve(Tokens.QueueService);
      const enabled = parseOnOff(state, queueService.getQueue().shuffle);
      queueService.setShuffle(enabled);
      queueService.persist();
      printSuccess(`Shuffle ${enabled ? 'on' : 'off'}`);
    });

  queue
    .command('repeat')
    .argument('[mode]', 'off|all|one; cycles when omitted')
    .description('Cycle or set the repeat mode')
    .action(async (mode?: string) => {
      const context = await getContext();
      loadLiveQueue(context);
      const queueService = context.container.resolve(Tokens.QueueService);
      const next =
        mode === undefined
          ? queueService.cycleRepeat()
          : (() => {
              const parsed = RepeatModeSchema.safeParse(mode);
              if (!parsed.success) {
                throw new ValidationError('Repeat mode must be one of: off, all, one');
              }
              queueService.setRepeatMode(parsed.data);
              return parsed.data;
            })();
      queueService.persist();
      printSuccess(`Repeat: ${next}`);
    });

  queue
    .command('play')
    .argument('<index>', 'queue position to play')
    .description('Jump to a queue item and play it')
    .action(async (index: string) => {
      const context = await getContext();
      loadLiveQueue(context);
      const queueService = context.container.resolve(Tokens.QueueService);
      const item =
        queueService.getQueue().items[
          parseUserIndex(index, queueService.getQueue().items.length) ?? -1
        ];
      if (item === undefined) {
        throw new ValidationError(`Invalid queue position "${index}"`);
      }
      const playback = context.container.resolve(Tokens.PlaybackService);
      await withSpinner(`Starting ${trackLabel(item.track)}…`, () => playback.playItem(item.id));
      queueService.persist();
      printSuccess(`Now playing: ${trackLabel(item.track)}`);
    });

  queue
    .command('save')
    .argument('<name>', 'name to save the queue under')
    .description('Save the current queue')
    .action(async (name: string) => {
      const context = await getContext();
      loadLiveQueue(context);
      const queueService = context.container.resolve(Tokens.QueueService);
      queueService.saveAs(name);
      printSuccess(`Queue saved as "${name}"`);
    });

  queue
    .command('restore')
    .argument('<name>', 'saved queue name')
    .description('Restore a saved queue')
    .action(async (name: string) => {
      const context = await getContext();
      const queueService = context.container.resolve(Tokens.QueueService);
      const snapshot = queueService.restore(name);
      queueService.persist();
      printSuccess(`Restored queue "${name}" (${String(snapshot.queue.items.length)} tracks)`);
    });

  queue
    .command('saved')
    .description('List saved queues')
    .action(async () => {
      const context = await getContext();
      const queueService = context.container.resolve(Tokens.QueueService);
      const saved = queueService.listSaved().filter((info) => !info.name.startsWith('_'));
      if (saved.length === 0) {
        printWarning('No saved queues. Save one: ytmusic queue save <name>');
        return;
      }
      for (const info of saved) {
        printLine(
          `  ${info.name}  (${String(info.itemCount)} tracks, saved ${info.savedAt.slice(0, 10)})`,
        );
      }
    });

  queue
    .command('delete')
    .argument('<name>', 'saved queue name')
    .description('Delete a saved queue')
    .action(async (name: string) => {
      const context = await getContext();
      const queueService = context.container.resolve(Tokens.QueueService);
      queueService.deleteSaved(name);
      printSuccess(`Deleted saved queue "${name}"`);
    });
}

/** Parses an on/off argument; toggles the current value when omitted. */
function parseOnOff(state: string | undefined, current: boolean): boolean {
  if (state === undefined) {
    return !current;
  }
  if (state === 'on') {
    return true;
  }
  if (state === 'off') {
    return false;
  }
  throw new ValidationError('Expected "on" or "off"');
}
