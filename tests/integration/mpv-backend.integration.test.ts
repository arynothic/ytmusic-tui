import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MpvPlayerBackend } from '@/player/mpv-backend';
import { findExecutable, runCommand } from '@/utils';

import { createTrackFixture } from '../helpers/fixtures';

/**
 * Smoke test against the real mpv binary and its real IPC socket.
 * Skipped automatically on machines without mpv and ffmpeg.
 */
const mpvBinary = await findExecutable('mpv');
const ffmpegBinary = await findExecutable('ffmpeg');
const describeWithMpv =
  mpvBinary !== undefined && ffmpegBinary !== undefined ? describe : describe.skip;

describeWithMpv('MpvPlayerBackend (real mpv)', () => {
  let workDir = '';
  let audioFile = '';

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'ytmusic-mpv-it-'));
    audioFile = join(workDir, 'tone.mp3');
    // A 3-second sine tone keeps the test fast and deterministic.
    await runCommand(ffmpegBinary as string, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      audioFile,
    ]);
  }, 30_000);

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('plays, reports position, pauses, seeks and stops', async () => {
    const backend = new MpvPlayerBackend({
      binary: mpvBinary as string,
      volume: 40,
      spawnTimeoutMs: 10_000,
    });
    try {
      await backend.play({ track: createTrackFixture(), streamUrl: audioFile });
      expect((await backend.getSnapshot()).status).toBe('playing');

      // Position reporting comes from observed time-pos property changes.
      let position = 0;
      await expect
        .poll(
          async () => {
            position = (await backend.getSnapshot()).positionSeconds;
            return position;
          },
          { timeout: 5000, interval: 100 },
        )
        .toBeGreaterThan(0);
      expect(position).toBeGreaterThan(0);

      await backend.pause();
      expect((await backend.getSnapshot()).status).toBe('paused');

      await backend.resume();
      expect((await backend.getSnapshot()).status).toBe('playing');

      await backend.seekTo(2);
      expect((await backend.getSnapshot()).positionSeconds).toBeGreaterThanOrEqual(2);

      await backend.setVolume(55);
      expect((await backend.getSnapshot()).volume).toBe(55);

      await backend.stop();
      expect((await backend.getSnapshot()).status).toBe('stopped');
    } finally {
      await backend.dispose();
    }
    expect((await backend.getSnapshot()).status).toBe('idle');
  }, 20_000);
});
