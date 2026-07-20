import { describe, expect, it } from 'vitest';

import { ApiError, AuthError, NetworkError, PlayerError } from '@/core/errors';
import { normalizeClientError } from '@/services/gateway';

describe('normalizeClientError', () => {
  it('passes AppErrors through unchanged', () => {
    const original = new PlayerError('PLAYER_IPC_ERROR', 'broken');
    expect(normalizeClientError(original, 'ctx')).toBe(original);
  });

  it('maps fetch failures to NetworkError', () => {
    const error = normalizeClientError(new TypeError('fetch failed'), 'Searching');
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).toContain('Searching');
  });

  it('maps errno-style failures to NetworkError', () => {
    expect(normalizeClientError(new Error('connect ETIMEDOUT 1.2.3.4'), 'ctx')).toBeInstanceOf(
      NetworkError,
    );
    expect(normalizeClientError(new Error('getaddrinfo ENOTFOUND x'), 'ctx')).toBeInstanceOf(
      NetworkError,
    );
  });

  it.each([
    ['Request failed with status code 401', AuthError, 'AUTH_INVALID_CREDENTIALS'],
    ['Request failed with status code 403', ApiError, 'API_FORBIDDEN'],
    ['Request failed with status code 404', ApiError, 'API_NOT_FOUND'],
    ['Request failed with status code 429', ApiError, 'API_RATE_LIMITED'],
    ['Request failed with status code 503', ApiError, 'API_UNAVAILABLE'],
  ])('maps "%s" to %s', (message, errorClass, code) => {
    const error = normalizeClientError(new Error(message), 'ctx');
    expect(error).toBeInstanceOf(errorClass);
    expect(error.code).toBe(code);
  });

  it('maps unknown failures to API_UNEXPECTED_RESPONSE', () => {
    const error = normalizeClientError(new Error('something weird'), 'ctx');
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('API_UNEXPECTED_RESPONSE');
    expect(error.message).toContain('something weird');
  });

  it('handles non-Error values', () => {
    expect(normalizeClientError('string failure', 'ctx')).toBeInstanceOf(ApiError);
    expect(normalizeClientError(42, 'ctx').message).toContain('42');
  });
});
