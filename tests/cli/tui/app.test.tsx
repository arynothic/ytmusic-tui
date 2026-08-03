import { render } from 'ink-testing-library';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App, type AppProps } from '@/cli/tui';
import { Tokens } from '@/core/tokens';
import type { PlaybackService } from '@/services/playback';
import type { QueueService } from '@/services/queue';
import type { SearchService } from '@/services/search';

import { createTrackFixture } from '../../helpers/fixtures';
import { createTempDir, removeTempDir } from '../../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../../helpers/test-context';

interface TuiHarness {
  service: ServiceTestContext;
  playback: PlaybackService;
  queueService: QueueService;
  searchService: SearchService;
  props: AppProps;
}

/** Renders the TUI over fully in-memory services with a seeded queue. */
async function makeHarness(directory: string): Promise<TuiHarness> {
  const service = await createServiceTestContext(directory, {
    tracks: [
      createTrackFixture({ id: 'v1', title: 'Alpha' }),
      createTrackFixture({ id: 'v2', title: 'Beta' }),
      createTrackFixture({ id: 'v3', title: 'Gamma' }),
    ],
  });
  const playback = service.context.container.resolve(Tokens.PlaybackService);
  const queueService = service.context.container.resolve(Tokens.QueueService);
  const searchService = service.context.container.resolve(Tokens.SearchService);
  await playback.playTracks([
    createTrackFixture({ id: 'q1', title: 'Queued One' }),
    createTrackFixture({ id: 'q2', title: 'Queued Two' }),
  ]);
  return {
    service,
    playback,
    queueService,
    searchService,
    props: { playback, queueService, searchService, tickMs: 20, listHeight: 8 },
  };
}

describe('TUI App', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('renders the now-playing panel and the queue', async () => {
    const { props } = await makeHarness(directory);
    const { lastFrame, unmount } = render(React.createElement(App, props));

    await vi.waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Queued One');
      expect(frame).toContain('Queued Two');
      expect(frame).toContain('Playing');
      expect(frame).toContain('Queue (2)');
    });
    unmount();
  });

  it('space toggles pause and resume', async () => {
    const { props, service } = await makeHarness(directory);
    const { stdin, unmount } = render(React.createElement(App, props));

    await vi.waitFor(() => {
      expect(service.player.calls.some((call) => call.method === 'play')).toBe(true);
    });
    stdin.write(' ');
    await vi.waitFor(() => {
      expect(service.player.calls.some((call) => call.method === 'pause')).toBe(true);
    });
    stdin.write(' ');
    await vi.waitFor(() => {
      expect(service.player.calls.some((call) => call.method === 'resume')).toBe(true);
    });
    unmount();
  });

  it('n advances to the next track and p goes back', async () => {
    const { props, service } = await makeHarness(directory);
    const { stdin, lastFrame, unmount } = render(React.createElement(App, props));

    await vi.waitFor(() => {
      expect(service.player.calls.some((call) => call.method === 'play')).toBe(true);
    });
    stdin.write('n');
    await vi.waitFor(() => {
      expect(props.queueService.current()?.track.title).toBe('Queued Two');
    });
    stdin.write('p');
    await vi.waitFor(() => {
      expect(props.queueService.current()?.track.title).toBe('Queued One');
    });
    expect(lastFrame()).toContain('Queued');
    unmount();
  });

  it('searches with / and plays a result with Enter', async () => {
    const { props } = await makeHarness(directory);
    const { stdin, lastFrame, unmount } = render(React.createElement(App, props));

    stdin.write('/');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Search:');
    });
    stdin.write('Alpha');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Alpha');
    });
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('1. Alpha');
    });
    // Select the first result and play it.
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(props.queueService.current()?.track.title).toBe('Alpha');
    });
    unmount();
  });

  it('a enqueues a search result without leaving search mode', async () => {
    const { props } = await makeHarness(directory);
    const { stdin, lastFrame, unmount } = render(React.createElement(App, props));

    stdin.write('/');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Search:');
    });
    stdin.write('Beta');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('Beta');
    });
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('1. Beta');
    });
    expect(props.queueService.getQueue().items).toHaveLength(2);

    stdin.write('a');
    await vi.waitFor(() => {
      expect(props.queueService.getQueue().items.map((item) => item.track.title)).toContain('Beta');
    });
    expect(props.queueService.getQueue().items).toHaveLength(3);
    unmount();
  });

  it('d removes the selected queue item', async () => {
    const { props } = await makeHarness(directory);
    const { stdin, lastFrame, unmount } = render(React.createElement(App, props));

    await vi.waitFor(() => {
      expect(props.queueService.getQueue().items).toHaveLength(2);
    });
    stdin.write('j'); // select row 2
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('› 2. Queued Two');
    });
    stdin.write('d');
    await vi.waitFor(() => {
      expect(props.queueService.getQueue().items.map((item) => item.track.title)).toEqual([
        'Queued One',
      ]);
    });
    unmount();
  });
});
