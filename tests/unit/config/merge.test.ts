import { describe, expect, it } from 'vitest';

import { deepMerge, flattenConfig, isPlainObject, setDotted } from '@/config';
import { AssertionFailedError } from '@/core/errors';

describe('isPlainObject', () => {
  it('accepts only plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
    expect(isPlainObject(42)).toBe(false);
  });
});

describe('deepMerge', () => {
  it('merges nested objects with source precedence', () => {
    const merged = deepMerge(
      { player: { backend: 'auto', volume: 80 }, search: { limit: 20 } },
      { player: { volume: 30 } },
    );
    expect(merged).toEqual({ player: { backend: 'auto', volume: 30 }, search: { limit: 20 } });
  });

  it('replaces arrays instead of merging them', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });

  it('does not mutate its inputs', () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    deepMerge(target, source);
    expect(target).toEqual({ a: { b: 1 } });
    expect(source).toEqual({ a: { c: 2 } });
  });

  it('drops prototype-polluting keys', () => {
    const merged = deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>);
    expect(merged).toEqual({});
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('setDotted', () => {
  it('sets nested values, creating intermediate objects', () => {
    const target: Record<string, unknown> = {};
    setDotted(target, 'player.volume', 40);
    expect(target).toEqual({ player: { volume: 40 } });
  });

  it('overwrites non-object intermediates', () => {
    const target: Record<string, unknown> = { player: 'oops' };
    setDotted(target, 'player.volume', 40);
    expect(target).toEqual({ player: { volume: 40 } });
  });

  it('refuses dangerous path segments', () => {
    expect(() => setDotted({}, '__proto__.polluted', true)).toThrowError(AssertionFailedError);
  });

  it('refuses empty segments', () => {
    expect(() => setDotted({}, 'a..b', 1)).toThrowError(AssertionFailedError);
  });
});

describe('flattenConfig', () => {
  it('flattens nested objects to dotted string pairs', () => {
    expect(flattenConfig({ player: { backend: 'auto', volume: 80 }, search: { limit: 20 } })).toEqual({
      'player.backend': 'auto',
      'player.volume': '80',
      'search.limit': '20',
    });
  });

  it('omits undefined leaves', () => {
    expect(flattenConfig({ player: { mpvPath: undefined, volume: 80 } })).toEqual({
      'player.volume': '80',
    });
  });
});
