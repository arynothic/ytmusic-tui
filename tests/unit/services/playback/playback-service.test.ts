import { describe, expect, it } from 'vitest';

import type { StreamResolver } from '@/core/ports';
import type { ResolvedStream, VideoId } from '@/models';
import { PlaybackService } from '@/services/playback';
import { QueueService } from '@/services/queue';

import { createTrackFixture } from '../../../helpers/fixtures';
import { MockHistoryStore } from '../../../mocks/mock-history-store';
import { MockPlayerBackend } from '../../../mocks/mock-player-backend';
import { MockQueueStore } from '../../../mocks/mock-queue-store';

/** StreamResolver fake mapping track ids to deterministic URLs. */
class MockStreamResolver implements StreamResolver {
  readonly resolved: VideoId[] = [];
  failFor: Set<string> | undefined;

  resolve(trackId: VideoId): Promise<ResolvedStream> {
    this.resolved.push(trackId);
    if (this.failFor?.has(trackId) === true) {
      return Promise.reject(new Error(`cannot resolve ${trackId}`));
    }
    return Promise.resolve({
      trackId,
      url: `https://streams.example.com/${trackId}`,
      expiresAt: Date.now() + 3_600_000,
    });
  }
}

interface Harness {
  playback: PlaybackService;
  player: MockPlayerBackend;
  resolver: MockStreamResolver;
  queueService: QueueService;
  history: MockHistoryStore;
}

/** Builds a playback service with fully in-memory collaborators. */
function makeHarness(): Harness {
  const player = new MockPlayerBackend();
  const resolver = new MockStreamResolver();
  const queueService = new QueueService({ queueStore: new MockQueueStore() });
  const history = new MockHistoryStore();
  const playback = new PlaybackService({
    player,
    streamResolver: resolver,
    queueService,
    historyStore: history,
    now: () => new Date('2026-07-29T10:00:00.000Z'),
  });
  return { playback, player, resolver, queueService, history };
}

const trackA = createTrackFixture({ id: 'A', title: 'Alpha' });
const trackB = createTrackFixture({ id: 'B', title: 'Beta' });
const trackC = createTrackFixture({ id: 'C', title: 'Gamma' });

describe('PlaybackService.playTracks', () => {
  it('replaces the queue, resolves the stream and starts playback', async () => {
    const { playback, player, resolver, history } = makeHarness();

    const started = await playback.playTracks([trackA, trackB]);
    expect(started.id).toBe('A');
    expect(resolver.resolved).toEqual(['A']);
    expect((await player.getSnapshot()).status).toBe('playing');
    expect(player.calls[0]?.method).toBe('play');
    const playArgs = player.calls[0]?.args[0] as { streamUrl: string };
    expect(playArgs.streamUrl).toBe('https://streams.example.com/A');

    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]?.playedAt).toBe('2026-07-29T10:00:00.000Z');
    expect(history.entries[0]?.track.id).toBe('A');
  });

  it('honors the start index', async () => {
    const { playback } = makeHarness();
    const started = await playback.playTracks([trackA, trackB], { startIndex: 1 });
    expect(started.id).toBe('B');
  });

  it('rejects an empty track list', async () => {
    const { playback } = makeHarness();
    await expect(playback.playTracks([])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('PlaybackService navigation', () => {
  it('next/previous navigate the queue and play', async () => {
    const { playback, resolver } = makeHarness();
    await playback.playTracks([trackA, trackB, trackC]);

    expect((await playback.next())?.id).toBe('B');
    expect((await playback.next())?.id).toBe('C');
    expect(await playback.next()).toBeNull();
    // After "next" hits the end, C is still current — previous goes back to B.
    expect((await playback.previous())?.id).toBe('B');
    expect(resolver.resolved).toEqual(['A', 'B', 'C', 'B']);
  });

  it('stops the player when next reaches the end of the queue', async () => {
    const { playback, player } = makeHarness();
    await playback.playTracks([trackA]);

    expect(await playback.next()).toBeNull();
    expect(player.calls.map((call) => call.method)).toContain('stop');
  });

  it('playItem jumps to a queue item', async () => {
    const { playback, queueService, resolver } = makeHarness();
    await playback.playTracks([trackA, trackB, trackC]);
    const target = queueService.getQueue().items[2]!;

    const started = await playback.playItem(target.id);
    expect(started.id).toBe('C');
    expect(resolver.resolved.at(-1)).toBe('C');
  });
});

describe('PlaybackService auto-advance', () => {
  it('advances when the backend reports a finished track', async () => {
    const { playback, player, resolver } = makeHarness();
    await playback.playTracks([trackA, trackB]);

    player.simulateEndOfTrack();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(resolver.resolved).toEqual(['A', 'B']);
    expect((await playback.now()).item?.track.id).toBe('B');
  });

  it('stays idle at the end of the queue', async () => {
    const { playback, player, resolver } = makeHarness();
    await playback.playTracks([trackA]);

    player.simulateEndOfTrack();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(resolver.resolved).toEqual(['A']);
  });

  it('does not double-skip on duplicate idle events', async () => {
    const { playback, player, resolver } = makeHarness();
    await playback.playTracks([trackA, trackB, trackC]);

    player.simulateEndOfTrack();
    player.simulateEndOfTrack();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    // Two idle events while one advance is in flight coalesce into one skip.
    expect(resolver.resolved).toEqual(['A', 'B']);
  });

  it('ignores a stale idle snapshot emitted before playback starts', async () => {
    const { playback, player, resolver, queueService } = makeHarness();
    // A backend may emit property updates (volume/position) that carry the
    // still-idle snapshot before play() flips it to playing. That must not
    // be mistaken for a finished track.
    queueService.replaceQueue([trackA, trackB], 0);
    player.emit({ status: 'idle' });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(resolver.resolved).toEqual([]);
    expect(queueService.current()?.track.id).toBe('A');

    await playback.playTracks([trackA, trackB]);
    expect(resolver.resolved).toEqual(['A']);
  });
});

describe('PlaybackService controls and now()', () => {
  it('delegates pause/resume/stop/seek/volume to the backend', async () => {
    const { playback, player } = makeHarness();
    await playback.playTracks([trackA]);

    await playback.pause();
    await playback.resume();
    await playback.seekTo(30);
    await playback.setVolume(55);
    await playback.stop();

    expect(player.calls.map((call) => call.method)).toEqual([
      'play',
      'pause',
      'resume',
      'seekTo',
      'setVolume',
      'stop',
    ]);
  });

  it('reports the combined now-playing state', async () => {
    const { playback } = makeHarness();
    await playback.playTracks([trackA, trackB]);

    const now = await playback.now();
    expect(now.snapshot.status).toBe('playing');
    expect(now.item?.track.id).toBe('A');
    expect(now.position).toBe(1);
    expect(now.total).toBe(2);
    expect(now.shuffle).toBe(false);
    expect(now.repeat).toBe('off');
  });
});
