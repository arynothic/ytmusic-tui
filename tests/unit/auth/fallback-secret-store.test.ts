import { describe, expect, it } from 'vitest';

import { FallbackSecretStore } from '@/auth';
import type { SecretStore } from '@/core/ports';

/** In-memory SecretStore double with a scripted availability. */
function createFakeStore(
  name: string,
  available: boolean,
): SecretStore & {
  data: Map<string, string>;
  probes: number;
} {
  const data = new Map<string, string>();
  const store = {
    data,
    probes: 0,
    name,
    isAvailable: (): Promise<boolean> => {
      store.probes += 1;
      return Promise.resolve(available);
    },
    get: (key: string): Promise<string | undefined> => Promise.resolve(data.get(key)),
    set: (key: string, value: string): Promise<void> => {
      data.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string): Promise<void> => {
      data.delete(key);
      return Promise.resolve();
    },
  };
  return store;
}

describe('FallbackSecretStore', () => {
  it('delegates to the primary when available', async () => {
    const primary = createFakeStore('primary', true);
    const fallback = createFakeStore('fallback', true);
    const store = new FallbackSecretStore(primary, fallback);

    await store.set('k', 'v');
    expect(primary.data.get('k')).toBe('v');
    expect(fallback.data.size).toBe(0);
    await expect(store.activeStoreName()).resolves.toBe('primary');
  });

  it('degrades to the fallback when the primary is unavailable', async () => {
    const primary = createFakeStore('primary', false);
    const fallback = createFakeStore('fallback', true);
    const store = new FallbackSecretStore(primary, fallback);

    await store.set('k', 'v');
    await expect(store.get('k')).resolves.toBe('v');
    expect(fallback.data.get('k')).toBe('v');
    expect(primary.probes).toBe(1);
    await expect(store.activeStoreName()).resolves.toBe('fallback');
  });

  it('probes the primary only once', async () => {
    const primary = createFakeStore('primary', false);
    const fallback = createFakeStore('fallback', true);
    const store = new FallbackSecretStore(primary, fallback);

    await store.set('a', '1');
    await store.get('a');
    await store.delete('a');
    expect(primary.probes).toBe(1);
  });

  it('is always available thanks to the fallback', async () => {
    const store = new FallbackSecretStore(
      createFakeStore('primary', false),
      createFakeStore('fallback', true),
    );
    await expect(store.isAvailable()).resolves.toBe(true);
  });
});
