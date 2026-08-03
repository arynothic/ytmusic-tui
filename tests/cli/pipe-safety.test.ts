import { afterEach, describe, expect, it, vi } from 'vitest';

import { installEpipeHandler } from '@/cli/pipe-safety';
import { ExitCode } from '@/core/errors';

type ErrorHandler = (error: NodeJS.ErrnoException) => void;

describe('installEpipeHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Captures the handlers registered on stdout/stderr. */
  function captureHandlers(): { stdout: ErrorHandler; stderr: ErrorHandler } {
    const stdoutSpy = vi.spyOn(process.stdout, 'on');
    const stderrSpy = vi.spyOn(process.stderr, 'on');
    installEpipeHandler();
    const findHandler = (calls: unknown[][]): ErrorHandler => {
      const call = calls.find(([event]) => event === 'error');
      if (call === undefined) {
        throw new Error('no error handler registered');
      }
      return call[1] as ErrorHandler;
    };
    return {
      stdout: findHandler(stdoutSpy.mock.calls),
      stderr: findHandler(stderrSpy.mock.calls),
    };
  }

  it('exits cleanly on EPIPE', () => {
    // Simulate process.exit by throwing — production never returns from it.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('__process_exit__');
    });
    const { stdout } = captureHandlers();

    expect(() => stdout(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).toThrow(
      '__process_exit__',
    );
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.Success);
  });

  it('rethrows non-EPIPE stream errors', () => {
    const { stderr } = captureHandlers();
    const other = Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    expect(() => stderr(other)).toThrow('disk full');
  });
});
