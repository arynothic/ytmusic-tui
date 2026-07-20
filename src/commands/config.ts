import type { Command } from 'commander';

import type { AppContext } from '@/cli/context';
import { printKeyValues, printLine, printSuccess } from '@/cli/output';

/** Lazily builds the application context on first command execution. */
export type ContextFactory = () => Promise<AppContext>;

/** Registers the `config` command group (list/get/set/path). */
export function registerConfigCommand(program: Command, getContext: ContextFactory): void {
  const showConfig = async (): Promise<void> => {
    const context = await getContext();
    printKeyValues(context.configService.list());
  };

  const config = program.command('config').description('View and manage configuration');

  config.command('list').alias('ls').description('Print the effective configuration').action(showConfig);

  config
    .command('path')
    .description('Print the configuration directory')
    .action(async () => {
      const context = await getContext();
      printLine(context.paths.configDir);
    });

  config
    .command('get')
    .argument('<key>', 'dotted configuration key, e.g. player.volume')
    .description('Print a single configuration value')
    .action(async (key: string) => {
      const context = await getContext();
      printLine(String(context.configService.get(key)));
    });

  config
    .command('set')
    .argument('<key>', 'dotted configuration key, e.g. player.volume')
    .argument('<value>', 'new value; JSON scalars are parsed ("75" → 75)')
    .description('Set a configuration value and persist it')
    .action(async (key: string, value: string) => {
      const context = await getContext();
      await context.configService.set(key, value);
      printSuccess(`${key} = ${value}`);
    });

  // `ytmusic config` without a subcommand prints the effective config.
  config.action(showConfig);
}
