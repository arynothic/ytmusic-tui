import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAuthCommands } from '@/commands/auth';
import { ValidationError } from '@/core/errors';

import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { login, runCli } from './helpers';

describe('auth commands', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory, { userName: 'Ada' });
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('logs in with --cookie', async () => {
    const output = await runCli(registerAuthCommands, service.context, [
      'login',
      '--cookie',
      'SID=abc; SAPISID=def',
    ]);
    expect(output).toContain('Logged in as Ada');
    expect(service.gateway.isAuthenticated()).toBe(true);
  });

  it('requires cookie input when non-interactive without flags', async () => {
    await expect(runCli(registerAuthCommands, service.context, ['login'])).rejects.toThrow(
      ValidationError,
    );
  });

  it('logs out and removes credentials', async () => {
    await login(service);
    expect(service.secretStore.data.size).toBe(1);

    const output = await runCli(registerAuthCommands, service.context, ['logout']);
    expect(output).toContain('Logged out');
    expect(service.secretStore.data.size).toBe(0);
    expect(service.gateway.isAuthenticated()).toBe(false);
  });
});
