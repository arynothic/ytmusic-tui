import { isPlainObject } from '@/config/merge';

/** Renders a leaf value for display; arrays and null are JSON-encoded. */
function renderLeaf(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value) ?? '';
}

/**
 * Flattens a nested object into dotted key → string value pairs,
 * e.g. `{ player: { volume: 80 } }` → `{ "player.volume": "80" }`.
 * Undefined leaves are omitted.
 */
export function flattenConfig(value: unknown, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      Object.assign(result, flattenConfig(nested, prefix === '' ? key : `${prefix}.${key}`));
    }
    return result;
  }
  if (value !== undefined && prefix !== '') {
    result[prefix] = renderLeaf(value);
  }
  return result;
}
