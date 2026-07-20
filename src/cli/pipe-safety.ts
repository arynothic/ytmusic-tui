import { ExitCode } from '@/core/errors';

/**
 * Converts stdout/stderr EPIPE failures into a clean exit. Without this,
 * piping output into tools like `head` crashes the process with an
 * unhandled stream error once the downstream side closes the pipe.
 */
export function installEpipeHandler(): void {
  const onError = (error: NodeJS.ErrnoException): void => {
    if (error.code === 'EPIPE') {
      process.exit(ExitCode.Success);
    }
    throw error;
  };
  process.stdout.on('error', onError);
  process.stderr.on('error', onError);
}
