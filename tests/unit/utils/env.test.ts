import { describe, expect, it, vi } from 'vitest';

import { ENV_PREFIX, getEnv, getEnvBoolean, getEnvInteger } from '@/utils/env';

describe('getEnv', () => {
  it('reads variables with the YTMUSIC_ prefix', () => {
    vi.stubEnv(`${ENV_PREFIX}FOO`, 'bar');
    expect(getEnv('FOO')).toBe('bar');
  });

  it('returns undefined for unset or empty values', () => {
    expect(getEnv('DEFINITELY_UNSET')).toBeUndefined();
    vi.stubEnv(`${ENV_PREFIX}EMPTY`, '');
    expect(getEnv('EMPTY')).toBeUndefined();
  });
});

describe('getEnvBoolean', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['YES', true],
    ['on', true],
    ['0', false],
    ['false', false],
    ['no', false],
    ['OFF', false],
  ])('parses %s as %s', (raw, expected) => {
    vi.stubEnv(`${ENV_PREFIX}FLAG`, raw);
    expect(getEnvBoolean('FLAG')).toBe(expected);
  });

  it('returns undefined when unset', () => {
    expect(getEnvBoolean('UNSET_FLAG')).toBeUndefined();
  });

  it('throws on unrecognized values', () => {
    vi.stubEnv(`${ENV_PREFIX}FLAG`, 'maybe');
    expect(() => getEnvBoolean('FLAG')).toThrowError(/boolean/);
  });
});

describe('getEnvInteger', () => {
  it('parses integers', () => {
    vi.stubEnv(`${ENV_PREFIX}LIMIT`, ' 42 ');
    expect(getEnvInteger('LIMIT')).toBe(42);
  });

  it('returns undefined when unset', () => {
    expect(getEnvInteger('UNSET_LIMIT')).toBeUndefined();
  });

  it('throws on non-integers', () => {
    vi.stubEnv(`${ENV_PREFIX}LIMIT`, 'abc');
    expect(() => getEnvInteger('LIMIT')).toThrowError(/integer/);
  });
});
