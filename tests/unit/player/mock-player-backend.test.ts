import { describe, expect, it } from 'vitest';

import { PlayerError } from '@/core/errors';
import type { PlayerSnapshot } from '@/core/ports';

import { createTrackFixture } from '../../helpers/fixtures';
import { MockPlayerBackend } from '../../mocks/mock-player-backend';

describe('MockPlayerBackend', () => {
  it('keeps a coherent snapshot across the control flow', async () => {
    const backend = new MockPlayerBackend({ volume: 60 });
    const track = createTrackFixture();

    await backend.play({ track, streamUrl: 'https://example.com/audio' });
    expect((await backend.getSnapshot()).status).toBe('playing');
    expect((await backend.getSnapshot()).track?.id).toBe(track.id);

    await backend.pause();
    expect((await backend.getSnapshot()).status).toBe('paused');

    await backend.resume();
    expect((await backend.getSnapshot()).status).toBe('playing');

    await backend.seekTo(42);
    expect((await backend.getSnapshot()).positionSeconds).toBe(42);

    await backend.setVolume(150);
    expect((await backend.getSnapshot()).volume).toBe(100);

    await backend.stop();
    const snapshot = await backend.getSnapshot();
    expect(snapshot.status).toBe('stopped');
    expect(snapshot.track).toBeNull();

    expect(backend.calls.map((call) => call.method)).toEqual([
      'play',
      'pause',
      'resume',
      'seekTo',
      'setVolume',
      'stop',
    ]);
  });

  it('notifies listeners on simulated end of track', async () => {
    const backend = new MockPlayerBackend();
    const snapshots: PlayerSnapshot[] = [];
    backend.onStateChange((snapshot) => {
      snapshots.push(snapshot);
    });
    await backend.play({ track: createTrackFixture(), streamUrl: 'https://example.com/audio' });

    backend.simulateEndOfTrack();
    expect(snapshots.at(-1)?.status).toBe('idle');
    expect(snapshots.at(-1)?.track).toBeNull();
  });

  it('rejects mutating calls when failWith is set', async () => {
    const backend = new MockPlayerBackend();
    backend.failWith = new PlayerError('PLAYER_IPC_ERROR', 'boom');

    await expect(
      backend.play({ track: createTrackFixture(), streamUrl: 'https://example.com/audio' }),
    ).rejects.toMatchObject({ code: 'PLAYER_IPC_ERROR' });
    await expect(backend.pause()).rejects.toBeInstanceOf(PlayerError);
  });
});
