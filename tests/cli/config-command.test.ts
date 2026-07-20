import { readFile } from 'node:fs/promises';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerConfigCommand } from '@/commands/config';
import { ConfigError } from '@/core/errors';

import { captureStdout, createTestContext } from '../helpers/test-context';
import { createTempDir, removeTempDir } from '../helpers/temp-dir';

describe('config command', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  async function run(argv: string[]): Promise<string> {
    const program = new Command();
    registerConfigCommand(program, () => createTestContext(directory));
    const stdout = captureStdout();
    try {
      await program.parseAsync(argv, { from: 'user' });
    } finally {
      stdout.restore();
    }
    return stdout.text();
  }

  it('prints the effective configuration by default', async () => {
    const output = await run(['config']);
    expect(output).toContain('player.backend');
    expect(output).toContain('auto');
    expect(output).toContain('player.volume');
  });

  it('prints the effective configuration with `config list`', async () => {
    const output = await run(['config', 'list']);
    expect(output).toContain('search.limit');
  });

  it('gets a single value', async () => {
    const output = await run(['config', 'get', 'player.volume']);
    expect(output.trim()).toBe('80');
  });

  it('sets and persists a value', async () => {
    const setOutput = await run(['config', 'set', 'player.volume', '45']);
    expect(setOutput).toContain('player.volume = 45');

    const getOutput = await run(['config', 'get', 'player.volume']);
    expect(getOutput.trim()).toBe('45');

    const onDisk = JSON.parse(await readFile(`${directory}/config.json`, 'utf8')) as {
      player: { volume: number };
    };
    expect(onDisk.player.volume).toBe(45);
  });

  it('prints the config directory', async () => {
    const output = await run(['config', 'path']);
    expect(output.trim()).toBe(directory);
  });

  it('fails with ConfigError for unknown keys', async () => {
    const program = new Command();
    registerConfigCommand(program, () => createTestContext(directory));
    await expect(program.parseAsync(['config', 'get', 'nope'], { from: 'user' })).rejects.toThrowError(
      ConfigError,
    );
  });
});
