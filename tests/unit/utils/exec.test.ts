import { describe, expect, it } from 'vitest';

import { findExecutable, runCommand } from '@/utils/exec';

const NODE = process.execPath;

describe('findExecutable', () => {
  it('finds a binary that exists on PATH', async () => {
    const found = await findExecutable('node');
    expect(found).toBeDefined();
    expect(found).toContain('node');
  });

  it('returns undefined for missing binaries', async () => {
    await expect(findExecutable('ytmusic-definitely-missing-binary')).resolves.toBeUndefined();
  });

  it('returns undefined when PATH is empty', async () => {
    await expect(findExecutable('node', '')).resolves.toBeUndefined();
  });
});

describe('runCommand', () => {
  it('captures stdout and exit code', async () => {
    const result = await runCommand(NODE, ['-e', 'process.stdout.write("hello")']);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.killed).toBe(false);
  });

  it('resolves with the exit code on failure instead of rejecting', async () => {
    const result = await runCommand(NODE, ['-e', 'process.exit(3)']);
    expect(result.code).toBe(3);
  });

  it('captures stderr', async () => {
    const result = await runCommand(NODE, ['-e', 'process.stderr.write("oops")']);
    expect(result.stderr).toBe('oops');
  });

  it('emits complete stdout lines including a trailing unterminated one', async () => {
    const lines: string[] = [];
    await runCommand(NODE, ['-e', 'process.stdout.write("a\\nb\\nc")'], {
      onStdoutLine: (line) => {
        lines.push(line);
      },
    });
    expect(lines).toEqual(['a', 'b', 'c']);
  });

  it('kills the process after the timeout', async () => {
    const result = await runCommand(NODE, ['-e', 'setTimeout(() => {}, 10_000)'], {
      timeoutMs: 100,
    });
    expect(result.killed).toBe(true);
    expect(result.code).toBe(-1);
  });

  it('rejects when the binary does not exist', async () => {
    await expect(runCommand('ytmusic-definitely-missing-binary')).rejects.toThrowError();
  });

  it('supports abort signals', async () => {
    const controller = new AbortController();
    const pending = runCommand(NODE, ['-e', 'setTimeout(() => {}, 10_000)'], {
      signal: controller.signal,
    });
    controller.abort();
    const result = await pending;
    expect(result.killed).toBe(true);
  });
});
