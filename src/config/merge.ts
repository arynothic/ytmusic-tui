import { invariant } from '@/core/errors';

/** A plain string-keyed object. */
export type PlainObject = Record<string, unknown>;

/** Narrows unknown values to plain (non-array, non-null) objects. */
export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Deep-merges `source` into `target`; source wins on conflicts, arrays are
 * replaced wholesale. Returns a new object; inputs are not mutated.
 */
export function deepMerge(target: PlainObject, source: PlainObject): PlainObject {
  const result: PlainObject = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }
    const existing = result[key];
    result[key] = isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return result;
}

/**
 * Sets a dotted path (e.g. `"player.volume"`) on a mutable object,
 * creating intermediate objects as needed. Prototype-pollution safe.
 */
export function setDotted(target: PlainObject, path: string, value: unknown): void {
  const segments = path.split('.');
  invariant(segments.every((segment) => segment.length > 0), `Invalid dotted path "${path}"`);
  let current: PlainObject = target;
  for (const segment of segments.slice(0, -1)) {
    invariant(!DANGEROUS_KEYS.has(segment), `Refusing to write "${segment}"`);
    const next = current[segment];
    if (!isPlainObject(next)) {
      current[segment] = {};
    }
    current = current[segment] as PlainObject;
  }
  const last = segments[segments.length - 1];
  invariant(last !== undefined && !DANGEROUS_KEYS.has(last), `Invalid dotted path "${path}"`);
  current[last] = value;
}
