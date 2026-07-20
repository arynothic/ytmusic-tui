import { describe, expect, it } from 'vitest';

import type { AppContext } from '@/cli/context';
import { CLI_NAME, CLI_VERSION, createProgram } from '@/cli/program';

/** Context factory for help/version paths, which never touch the context. */
const noContext = (): Promise<AppContext> =>
  Promise.reject(new Error('context must not be built for help/version'));

/**
 * Runs the program with the given user argv and captures everything
 * commander writes to stdout/stderr.
 */
export function captureOutput(argv: string[]): string {
  const program = createProgram(noContext);
  let output = '';
  program.configureOutput({
    writeOut: (chunk) => {
      output += chunk;
    },
    writeErr: (chunk) => {
      output += chunk;
    },
  });
  program.exitOverride();
  try {
    program.parse(argv, { from: 'user' });
  } catch {
    // commander throws CommanderError on --help/--version with exitOverride
  }
  return output;
}

describe('program', () => {
  it('is named and versioned', () => {
    expect(CLI_NAME).toBe('ytmusic');
    expect(captureOutput(['--version'])).toContain(CLI_VERSION);
  });

  it('prints help', () => {
    expect(captureOutput(['--help'])).toMatchSnapshot();
  });
});
