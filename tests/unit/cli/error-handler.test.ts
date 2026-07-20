import { afterEach, describe, expect, it } from 'vitest';

import { handleFatalError } from '@/cli/error-handler';
import { AuthError, ExitCode } from '@/core/errors';

import { captureStderr } from '../../helpers/test-context';

describe('handleFatalError', () => {
  const previousExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = previousExitCode;
  });

  it('maps AppErrors to their documented exit code', () => {
    const stderr = captureStderr();
    handleFatalError(new AuthError('AUTH_REQUIRED', 'login first'));
    stderr.restore();

    expect(process.exitCode).toBe(ExitCode.Auth);
    expect(stderr.text()).toContain('login first');
    expect(stderr.text()).toContain('AUTH_REQUIRED');
  });

  it('wraps unexpected errors with a stack trace and EX_SOFTWARE', () => {
    const stderr = captureStderr();
    handleFatalError(new Error('boom'));
    stderr.restore();

    expect(process.exitCode).toBe(ExitCode.Software);
    expect(stderr.text()).toContain('boom');
    expect(stderr.text()).toContain('UNEXPECTED_ERROR');
  });
});
