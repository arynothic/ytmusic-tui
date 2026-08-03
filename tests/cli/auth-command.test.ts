import { writeFile } from 'node:fs/promises';

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

  it('logs in with a Netscape cookies.txt --file', async () => {
    const file = `${directory}/cookies.txt`;
    await writeFile(
      file,
      [
        '# Netscape HTTP Cookie File',
        '.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\tabc123',
        '.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSAPISID\tsapi456',
      ].join('\n'),
    );
    const output = await runCli(registerAuthCommands, service.context, ['login', '--file', file]);
    expect(output).toContain('Logged in as Ada');
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
