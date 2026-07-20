import chalk from 'chalk';

import { toAppError } from '@/core/errors';
import { printErrorLine } from '@/cli/output';

/**
 * Top-level error handler: formats any thrown value, prints it to
 * stderr, and maps it to the process exit code. Non-operational errors
 * (bugs) additionally print their stack trace.
 */
export function handleFatalError(error: unknown): void {
  const appError = toAppError(error);
  printErrorLine(
    `${chalk.red('✖')} ${chalk.red(appError.message)} ${chalk.dim(`[${appError.code}]`)}`,
  );
  if (!appError.isOperational && appError.stack !== undefined) {
    printErrorLine(chalk.dim(appError.stack));
  }
  process.exitCode = appError.exitCode;
}
