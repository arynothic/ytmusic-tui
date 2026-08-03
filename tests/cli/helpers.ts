import { Command } from 'commander';

import type { AppContext } from '@/cli/context';
import type { ContextFactory } from '@/commands/config';
import { Tokens } from '@/core/tokens';

import { captureStdout, type ServiceTestContext } from '../helpers/test-context';

/** Registers commands on a fresh program and runs them with captured stdout. */
export async function runCli(
  register: (program: Command, getContext: ContextFactory) => void,
  context: AppContext,
  argv: string[],
): Promise<string> {
  const program = new Command();
  register(program, () => Promise.resolve(context));
  const stdout = captureStdout();
  try {
    await program.parseAsync(argv, { from: 'user' });
  } finally {
    stdout.restore();
  }
  return stdout.text();
}

/** Logs in through the real AuthService against the mock gateway. */
export async function login(service: ServiceTestContext): Promise<void> {
  await service.context.container
    .resolve(Tokens.AuthService)
    .login({ cookie: 'SID=abc; SAPISID=def' });
}
