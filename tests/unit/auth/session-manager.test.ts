import { beforeEach, describe, expect, it } from 'vitest';

import { CREDENTIALS_KEY, SessionManager } from '@/auth';
import { AuthError } from '@/core/errors';
import type { SecretStore } from '@/core/ports';

import { createTrackFixture } from '../../helpers/fixtures';
import { MockMusicGateway } from '../../mocks/mock-music-gateway';

/** In-memory SecretStore double. */
function createMemoryStore(): SecretStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    name: 'memory',
    isAvailable: () => Promise.resolve(true),
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

describe('SessionManager', () => {
  let store: ReturnType<typeof createMemoryStore>;
  let gateway: MockMusicGateway;
  let manager: SessionManager;

  beforeEach(() => {
    store = createMemoryStore();
    gateway = new MockMusicGateway({ tracks: [createTrackFixture()], userName: 'Ada' });
    manager = new SessionManager(store, gateway);
  });

  it('logs in: validates, enriches with the user name, and persists', async () => {
    const credentials = await manager.login({ cookie: 'SID=a; SAPISID=b', visitorData: 'v123' });

    expect(credentials.userName).toBe('Ada');
    expect(credentials.visitorData).toBe('v123');
    expect(gateway.isAuthenticated()).toBe(true);

    const stored = store.data.get(CREDENTIALS_KEY);
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!)).toMatchObject({ cookie: 'SID=a; SAPISID=b', userName: 'Ada' });
  });

  it('does not persist credentials the gateway rejects', async () => {
    const rejecting = new MockMusicGateway();
    rejecting.authenticate = () => Promise.reject(new Error('401'));
    const failing = new SessionManager(store, rejecting);

    await expect(failing.login({ cookie: 'SID=a; SAPISID=b' })).rejects.toThrowError(AuthError);
    await expect(failing.login({ cookie: 'SID=a; SAPISID=b' })).rejects.toThrowError(
      /rejected/,
    );
    expect(store.data.size).toBe(0);
  });

  it('passes through AuthErrors from the gateway unchanged', async () => {
    const rejecting = new MockMusicGateway();
    rejecting.authenticate = () =>
      Promise.reject(new AuthError('AUTH_SESSION_EXPIRED', 'expired'));
    const failing = new SessionManager(store, rejecting);

    await expect(failing.login({ cookie: 'x' })).rejects.toThrowError(/expired/);
  });

  it('restores a session into the gateway', async () => {
    await manager.login({ cookie: 'SID=a; SAPISID=b' });
    const freshGateway = new MockMusicGateway();
    const restored = new SessionManager(store, freshGateway);

    await expect(restored.restoreSession()).resolves.toBe(true);
    expect(freshGateway.isAuthenticated()).toBe(true);
  });

  it('restoreSession returns false when logged out', async () => {
    await expect(manager.restoreSession()).resolves.toBe(false);
  });

  it('requireSession throws AUTH_REQUIRED when logged out', async () => {
    await expect(manager.requireSession()).rejects.toThrowError(/AUTH_REQUIRED|Not logged in/);
  });

  it('reports status for logged-in and logged-out states', async () => {
    await expect(manager.status()).resolves.toEqual({ loggedIn: false, store: 'memory' });

    await manager.login({ cookie: 'SID=a; SAPISID=b' });
    const status = await manager.status();
    expect(status.loggedIn).toBe(true);
    expect(status.userName).toBe('Ada');
    expect(status.savedAt).toBeDefined();
  });

  it('logs out: deletes stored credentials and drops the session', async () => {
    await manager.login({ cookie: 'SID=a; SAPISID=b' });
    await manager.logout();

    expect(store.data.size).toBe(0);
    expect(gateway.isAuthenticated()).toBe(false);
  });

  it('throws AuthError for corrupted stored credentials', async () => {
    store.data.set(CREDENTIALS_KEY, '{ not json');
    await expect(manager.loadCredentials()).rejects.toThrowError(AuthError);
    await expect(manager.loadCredentials()).rejects.toThrowError(/corrupted/);
  });
});
