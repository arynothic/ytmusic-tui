import { describe, expect, it, vi } from 'vitest';

import { DownloadError } from '@/core/errors';
import { DownloadService } from '@/services/download';
import type { CommandResult, RunCommandOptions } from '@/utils';

import { createTrackFixture } from '../../../helpers/fixtures';

/** runCommand fake capturing args and emitting scripted stdout lines. */
function makeRun(script: { lines?: string[]; code?: number; stderr?: string; killed?: boolean }) {
  const calls: { command: string; args: readonly string[]; options: RunCommandOptions }[] = [];
  const run = (
    command: string,
    args: readonly string[] = [],
    options: RunCommandOptions = {},
  ): Promise<CommandResult> => {
    calls.push({ command, args, options });
    for (const line of script.lines ?? []) {
      options.onStdoutLine?.(line);
    }
    return Promise.resolve({
      code: script.code ?? 0,
      stdout: '',
      stderr: script.stderr ?? '',
      killed: script.killed ?? false,
    });
  };
  return { run, calls };
}

const findExecOk = vi.fn(async () => '/usr/bin/yt-dlp');

describe('DownloadService', () => {
  it('builds yt-dlp args and returns the reported file path', async () => {
    const { run, calls } = makeRun({
      lines: ['[download]   0.0%', '[download]  55.5%', '/music/Artist - Title.m4a'],
    });
    const service = new DownloadService({
      directory: '/music',
      audioFormat: 'mp3',
      run,
      findExec: findExecOk,
    });
    const progress: number[] = [];

    const result = await service.download(
      createTrackFixture({
        id: 'vid001',
        title: 'Title',
        artists: [{ name: 'Artist' }],
      }),
      { onProgress: (percent) => progress.push(percent) },
    );

    expect(result.filePath).toBe('/music/Artist - Title.m4a');
    expect(progress).toEqual([0, 55.5]);

    const args = calls[0]?.args.join(' ') ?? '';
    expect(calls[0]?.command).toBe('/usr/bin/yt-dlp');
    expect(args).toContain('-x --audio-format mp3');
    expect(args).toContain('--embed-metadata');
    expect(args).toContain('--embed-thumbnail');
    expect(args).toContain('--print after_move:filepath');
    expect(args).toContain('--newline');
    expect(args).toContain('music.youtube.com/watch?v=vid001');
  });

  it('uses -f bestaudio for the bestaudio format', async () => {
    const { run, calls } = makeRun({ lines: ['/music/a.webm'] });
    const service = new DownloadService({
      directory: '/music',
      audioFormat: 'bestaudio',
      run,
      findExec: findExecOk,
    });
    await service.download(createTrackFixture({ id: 'vid002' }));
    expect(calls[0]?.args).toContain('-f');
    expect(calls[0]?.args).not.toContain('--audio-format');
  });

  it('sanitizes unsafe filename characters', async () => {
    const { run, calls } = makeRun({ lines: ['/music/x.webm'] });
    const service = new DownloadService({
      directory: '/music',
      audioFormat: 'bestaudio',
      run,
      findExec: findExecOk,
    });
    await service.download(
      createTrackFixture({ title: 'a/b:c*d?e"f<g>h|i', artists: [{ name: 'A' }] }),
    );
    const outputIndex = calls[0]?.args.indexOf('-o') ?? -1;
    const template = calls[0]?.args[outputIndex + 1];
    const fileName = template?.split('/').at(-1) ?? '';
    expect(fileName).not.toMatch(/[\\/:*?"<>|]/);
    expect(fileName).toContain('A - a b c d e f g h i');
  });

  it('raises DOWNLOAD_TOOL_MISSING when yt-dlp is absent', async () => {
    const service = new DownloadService({
      directory: '/music',
      audioFormat: 'bestaudio',
      run: makeRun({}).run,
      findExec: vi.fn(async () => undefined),
    });
    await expect(service.download(createTrackFixture())).rejects.toMatchObject({
      code: 'DOWNLOAD_TOOL_MISSING',
    });
  });

  it('raises DOWNLOAD_FAILED on non-zero exit with stderr summary', async () => {
    const service = new DownloadService({
      directory: '/music',
      audioFormat: 'bestaudio',
      run: makeRun({ code: 1, stderr: 'WARNING: x\nERROR: Video unavailable' }).run,
      findExec: findExecOk,
    });
    const error = await service.download(createTrackFixture()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DownloadError);
    expect((error as DownloadError).message).toContain('Video unavailable');
  });

  it('raises DOWNLOAD_FAILED on timeout', async () => {
    const service = new DownloadService({
      directory: '/music',
      audioFormat: 'bestaudio',
      run: makeRun({ killed: true }).run,
      findExec: findExecOk,
    });
    await expect(service.download(createTrackFixture())).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
  });

  it('raises DOWNLOAD_FAILED when no output file is reported', async () => {
    const service = new DownloadService({
      directory: '/music',
      audioFormat: 'bestaudio',
      run: makeRun({ lines: ['[download] 100.0%'] }).run,
      findExec: findExecOk,
    });
    await expect(service.download(createTrackFixture())).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    });
  });
});
