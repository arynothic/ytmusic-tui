import { Command } from 'commander';

import { registerAlbumCommand } from '@/commands/album';
import { registerArtistCommand } from '@/commands/artist';
import { registerAuthCommands } from '@/commands/auth';
import { registerCacheCommand } from '@/commands/cache';
import { registerConfigCommand, type ContextFactory } from '@/commands/config';
import { registerControlCommands } from '@/commands/controls';
import { registerDownloadCommand } from '@/commands/download';
import { registerLyricsCommand } from '@/commands/lyrics';
import { registerNowCommand } from '@/commands/now';
import { registerPlayCommand } from '@/commands/play';
import { registerPlaylistCommand } from '@/commands/playlist';
import { registerQueueCommand } from '@/commands/queue';
import { registerSearchCommand } from '@/commands/search';
import { registerTuiCommand } from '@/commands/tui';

/** Canonical name of the CLI binary. */
export const CLI_NAME = 'ytmusic';

/** Current CLI version, kept in sync with package.json and CHANGELOG.md. */
export const CLI_VERSION = '0.1.0';

/**
 * Builds the root commander program and registers all commands.
 * The context factory is invoked lazily by command actions only, so
 * `--help` and `--version` never pay the startup cost.
 */
export function createProgram(getContext: ContextFactory): Command {
  const program = new Command()
    .name(CLI_NAME)
    .description('A fast, modern terminal client for YouTube Music')
    .version(CLI_VERSION);

  registerSearchCommand(program, getContext);
  registerPlayCommand(program, getContext);
  registerArtistCommand(program, getContext);
  registerAlbumCommand(program, getContext);
  registerPlaylistCommand(program, getContext);
  registerQueueCommand(program, getContext);
  registerControlCommands(program, getContext);
  registerNowCommand(program, getContext);
  registerLyricsCommand(program, getContext);
  registerTuiCommand(program, getContext);
  registerDownloadCommand(program, getContext);
  registerAuthCommands(program, getContext);
  registerCacheCommand(program, getContext);
  registerConfigCommand(program, getContext);

  return program;
}
