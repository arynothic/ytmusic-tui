import { Command } from 'commander';

import { registerConfigCommand, type ContextFactory } from '@/commands/config';

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

  registerConfigCommand(program, getContext);

  return program;
}
