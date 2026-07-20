import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ApiError,
  AppError,
  AssertionFailedError,
  AuthError,
  CacheError,
  ConfigError,
  DownloadError,
  ExitCode,
  invariant,
  isRetryableError,
  NetworkError,
  PlayerError,
  StreamError,
  toAppError,
  UnexpectedError,
  ValidationError,
} from '@/core/errors';

describe('AppError hierarchy', () => {
  it('every subclass is an AppError with a stable code and exit code', () => {
    const errors: AppError[] = [
      new ConfigError('CONFIG_INVALID', 'bad config'),
      new AuthError('AUTH_REQUIRED', 'login first'),
      new NetworkError('NETWORK_TIMEOUT', 'timed out'),
      new ApiError('API_NOT_FOUND', 'missing'),
      new PlayerError('PLAYER_NOT_FOUND', 'no player'),
      new StreamError('STREAM_RESOLVE_FAILED', 'no url'),
      new CacheError('CACHE_OPEN_FAILED', 'db locked'),
      new ValidationError('bad input'),
      new DownloadError('DOWNLOAD_FAILED', 'failed'),
      new UnexpectedError('boom'),
      new AssertionFailedError('should not happen'),
    ];
    for (const error of errors) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code.length).toBeGreaterThan(0);
      expect(error.exitCode).toBeGreaterThan(0);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it('maps each family to a documented exit code', () => {
    expect(new ConfigError('CONFIG_NOT_FOUND', 'x').exitCode).toBe(ExitCode.Config);
    expect(new AuthError('AUTH_REQUIRED', 'x').exitCode).toBe(ExitCode.Auth);
    expect(new NetworkError('NETWORK_UNREACHABLE', 'x').exitCode).toBe(ExitCode.Unavailable);
    expect(new ApiError('API_NOT_FOUND', 'x').exitCode).toBe(ExitCode.NotFound);
    expect(new ApiError('API_RATE_LIMITED', 'x').exitCode).toBe(ExitCode.Unavailable);
    expect(new PlayerError('PLAYER_IPC_ERROR', 'x').exitCode).toBe(ExitCode.Unavailable);
    expect(new StreamError('STREAM_RESOLVER_MISSING', 'x').exitCode).toBe(ExitCode.Unavailable);
    expect(new CacheError('CACHE_CORRUPT', 'x').exitCode).toBe(ExitCode.IoError);
    expect(new ValidationError('x').exitCode).toBe(ExitCode.Usage);
    expect(new DownloadError('DOWNLOAD_TOOL_MISSING', 'x').exitCode).toBe(ExitCode.Unavailable);
    expect(new DownloadError('DOWNLOAD_FAILED', 'x').exitCode).toBe(ExitCode.General);
    expect(new UnexpectedError('x').exitCode).toBe(ExitCode.Software);
  });

  it('preserves the cause chain', () => {
    const cause = new Error('root cause');
    const error = new AuthError('AUTH_STORE_UNAVAILABLE', 'keyring down', { cause });
    expect(error.cause).toBe(cause);
  });

  it('flags unexpected and assertion errors as non-operational', () => {
    expect(new UnexpectedError('x').isOperational).toBe(false);
    expect(new AssertionFailedError('x').isOperational).toBe(false);
    expect(new ApiError('API_UNAVAILABLE', 'x').isOperational).toBe(true);
  });
});

describe('toAppError', () => {
  it('passes AppErrors through unchanged', () => {
    const original = new AuthError('AUTH_REQUIRED', 'login');
    expect(toAppError(original)).toBe(original);
  });

  it('wraps plain Errors preserving the cause', () => {
    const cause = new TypeError('nope');
    const wrapped = toAppError(cause);
    expect(wrapped).toBeInstanceOf(UnexpectedError);
    expect(wrapped.message).toBe('nope');
    expect(wrapped.cause).toBe(cause);
  });

  it('wraps non-Error values', () => {
    expect(toAppError('string failure').message).toBe('string failure');
    expect(toAppError(42).details).toEqual({ thrownValue: 42 });
  });
});

describe('isRetryableError', () => {
  it('treats network errors as retryable', () => {
    expect(isRetryableError(new NetworkError('NETWORK_TIMEOUT', 'x'))).toBe(true);
  });

  it('treats rate limiting and outages as retryable', () => {
    expect(isRetryableError(new ApiError('API_RATE_LIMITED', 'x'))).toBe(true);
    expect(isRetryableError(new ApiError('API_UNAVAILABLE', 'x'))).toBe(true);
  });

  it('treats everything else as final', () => {
    expect(isRetryableError(new ApiError('API_NOT_FOUND', 'x'))).toBe(false);
    expect(isRetryableError(new AuthError('AUTH_REQUIRED', 'x'))).toBe(false);
    expect(isRetryableError(new Error('x'))).toBe(false);
  });
});

describe('invariant', () => {
  it('does nothing when the condition holds', () => {
    expect(() => invariant(true, 'unreachable')).not.toThrow();
  });

  it('throws AssertionFailedError when violated', () => {
    expect(() => invariant(false, 'broken')).toThrowError(AssertionFailedError);
    expect(() => invariant(null, 'broken')).toThrowError('broken');
  });
});

describe('ValidationError.fromZodError', () => {
  it('flattens zod issues into the message and details', () => {
    const schema = z.object({ name: z.string(), age: z.number().int().min(0) });
    const parsed = schema.safeParse({ name: 42, age: -1 });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    const error = ValidationError.fromZodError(parsed.error, 'test payload');
    expect(error.message).toContain('test payload');
    expect(error.message).toContain('name');
    expect(error.message).toContain('age');
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.['issues']).toHaveLength(2);
  });
});
