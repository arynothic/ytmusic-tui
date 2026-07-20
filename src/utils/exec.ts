import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

/**
 * Searches the PATH for an executable file, returning its absolute path.
 * Returns `undefined` when the executable cannot be found. Honors PATHEXT
 * on Windows.
 */
export async function findExecutable(
  name: string,
  pathEnv: string = process.env.PATH ?? '',
): Promise<string | undefined> {
  const extensions =
    process.platform === 'win32'
      ? [...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';'), '']
      : [''];
  for (const directory of pathEnv.split(delimiter)) {
    if (directory === '') {
      continue;
    }
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not in this directory — keep searching.
      }
    }
  }
  return undefined;
}

/** Options for {@link runCommand}. */
export interface RunCommandOptions {
  readonly cwd?: string;
  /** Extra environment variables merged over `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Aborts (kills) the child process. */
  readonly signal?: AbortSignal;
  /** Kills the child process after this many milliseconds. */
  readonly timeoutMs?: number;
  /** Receives each complete stdout line as it arrives (progress parsing). */
  readonly onStdoutLine?: (line: string) => void;
}

/** Outcome of a finished {@link runCommand} invocation. */
export interface CommandResult {
  /** Exit code, or `-1` when the process was terminated by a signal. */
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  /** True when the process ended due to a signal, timeout, or abort. */
  readonly killed: boolean;
}

/**
 * Spawns a command and captures its output. Resolves on non-zero exit
 * codes (inspect `result.code`); rejects only when the process fails to
 * start at all (e.g. binary not found).
 */
export function runCommand(
  command: string,
  args: readonly string[] = [],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env === undefined ? process.env : { ...process.env, ...options.env },
      signal: options.signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (child.stdout === null || child.stderr === null) {
      reject(new Error('Failed to open child process stdio pipes'));
      return;
    }

    let stdout = '';
    let stderr = '';
    let killed = false;
    let pendingLine = '';
    let settled = false;

    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            killed = true;
            child.kill('SIGKILL');
          }, options.timeoutMs);

    const settle = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      fn();
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (options.onStdoutLine !== undefined) {
        pendingLine += chunk;
        const lines = pendingLine.split(/\r?\n/);
        pendingLine = lines.pop() ?? '';
        for (const line of lines) {
          options.onStdoutLine(line);
        }
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const finish = (code: number | null, wasKilled: boolean): void => {
      if (pendingLine !== '' && options.onStdoutLine !== undefined) {
        options.onStdoutLine(pendingLine);
        pendingLine = '';
      }
      resolve({ code: code ?? -1, stdout, stderr, killed: wasKilled });
    };

    child.on('error', (error: Error) => {
      // An AbortError means our own signal killed the child: that is
      // expected control flow, so resolve as a kill instead of rejecting.
      settle(() => {
        if (error.name === 'AbortError') {
          finish(null, true);
        } else {
          reject(error);
        }
      });
    });

    child.on('close', (code, signal) => {
      settle(() => {
        finish(code, killed || signal !== null);
      });
    });
  });
}
