import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/core/errors';

const keytarMock = vi.hoisted(() => ({
  getPassword: vi.fn<(service: string, account: string) => Promise<string | null>>(),
  setPassword: vi.fn<(service: string, account: string, password: string) => Promise<void>>(),
  deletePassword: vi.fn<(service: string, account: string) => Promise<boolean>>(),
}));

vi.mock('keytar', () => ({ default: keytarMock }));

import { KeytarSecretStore } from '@/auth/keytar-secret-store';

describe('KeytarSecretStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps get/set/delete to the keychain service', async () => {
    keytarMock.getPassword.mockResolvedValue('s3cret');
    const store = new KeytarSecretStore();

    await store.set('account', 's3cret');
    expect(keytarMock.setPassword).toHaveBeenCalledWith('ytmusic-cli', 'account', 's3cret');

    await expect(store.get('account')).resolves.toBe('s3cret');
    expect(keytarMock.getPassword).toHaveBeenCalledWith('ytmusic-cli', 'account');

    keytarMock.deletePassword.mockResolvedValue(true);
    await store.delete('account');
    expect(keytarMock.deletePassword).toHaveBeenCalledWith('ytmusic-cli', 'account');
  });

  it('maps null passwords to undefined', async () => {
    keytarMock.getPassword.mockResolvedValue(null);
    await expect(new KeytarSecretStore().get('missing')).resolves.toBeUndefined();
  });

  it('wraps keychain failures in AuthError', async () => {
    keytarMock.getPassword.mockRejectedValue(new Error('dbus down'));
    keytarMock.setPassword.mockRejectedValue(new Error('dbus down'));
    keytarMock.deletePassword.mockRejectedValue(new Error('dbus down'));
    const store = new KeytarSecretStore();
    await expect(store.get('k')).rejects.toThrowError(AuthError);
    await expect(store.set('k', 'v')).rejects.toThrowError(AuthError);
    await expect(store.delete('k')).rejects.toThrowError(AuthError);
  });

  it('probes availability once and memoizes it', async () => {
    keytarMock.setPassword.mockResolvedValue(undefined);
    keytarMock.getPassword.mockResolvedValue('probe');
    keytarMock.deletePassword.mockResolvedValue(true);
    const store = new KeytarSecretStore();

    await expect(store.isAvailable()).resolves.toBe(true);
    await expect(store.isAvailable()).resolves.toBe(true);
    expect(keytarMock.setPassword).toHaveBeenCalledTimes(1);
  });

  it('reports unavailable when the probe fails', async () => {
    keytarMock.setPassword.mockRejectedValue(new Error('no secret service'));
    await expect(new KeytarSecretStore().isAvailable()).resolves.toBe(false);
  });
});
