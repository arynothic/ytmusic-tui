import { describe, expect, it } from 'vitest';

import { SessionManager } from '@/auth';
import { AuthError } from '@/core/errors';
import type { SecretStore } from '@/core/ports';
import { AuthService } from '@/services/auth';

import { MockMusicGateway } from '../../../mocks/mock-music-gateway';

/** In-memory SecretStore double. */
function createMemoryStore(): SecretStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    name: 'memory',
    data,
    isAvailable: () => Promise.resolve(true),
    get: (key: string) => Promise.resolve(data.get(key)),
    set: (key: string, value: string) => {
      data.set(key, value);
      return Promise.resolve();
    },
    delete: (key: string) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

/** Builds the auth service over a mock gateway + memory secret store. */
function makeService() {
  const gateway = new MockMusicGateway({ userName: 'Ada' });
  const store = createMemoryStore();
  const sessionManager = new SessionManager(store, gateway);
  const service = new AuthService({ sessionManager });
  return { service, gateway, store };
}

const COOKIE_HEADER =
  'SID=abc123; SAPISID=sapi456; HSID=def456; SSID=ghi789; __Secure-1PSID=jkl012; PREF=tz=UTC';

const NETSCAPE_EXPORT = [
  '# Netscape HTTP Cookie File',
  '.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tabc123',
  '.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSAPISID\tsapi456',
  '.youtube.com\tTRUE\t/\tTRUE\t2000000000\tHSID\tdef456',
  '.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSSID\tghi789',
  '.youtube.com\tTRUE\t/\tTRUE\t2000000000\t__Secure-1PSID\tjkl012',
].join('\n');

describe('AuthService', () => {
  it('logs in from a raw Cookie header', async () => {
    const { service, gateway } = makeService();
    const credentials = await service.loginWithCookieExport(COOKIE_HEADER);
    expect(credentials.cookie).toContain('SID=abc123');
    expect(credentials.userName).toBe('Ada');
    expect(gateway.isAuthenticated()).toBe(true);
  });

  it('logs in from a Netscape cookies.txt export', async () => {
    const { service } = makeService();
    const credentials = await service.loginWithCookieExport(NETSCAPE_EXPORT);
    expect(credentials.cookie).toContain('SID=abc123');
  });

  it('reports status and logs out', async () => {
    const { service } = makeService();

    expect((await service.status()).loggedIn).toBe(false);
    await service.loginWithCookieExport(COOKIE_HEADER);
    const status = await service.status();
    expect(status.loggedIn).toBe(true);
    expect(status.userName).toBe('Ada');

    await service.logout();
    expect((await service.status()).loggedIn).toBe(false);
  });

  it('ensureAuthenticated restores a stored session', async () => {
    const { service, gateway } = makeService();
    await expect(service.ensureAuthenticated()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });

    await service.loginWithCookieExport(COOKIE_HEADER);
    await gateway.deauthenticate();

    await service.ensureAuthenticated();
    expect(gateway.isAuthenticated()).toBe(true);
  });

  it('propagates AuthError when the backend rejects cookies', async () => {
    const { service, gateway } = makeService();
    gateway.failOnAuthenticate = new AuthError('AUTH_INVALID_CREDENTIALS', 'rejected');
    await expect(service.loginWithCookieExport(COOKIE_HEADER)).rejects.toBeInstanceOf(AuthError);
  });
});
