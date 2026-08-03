import { Box, useApp, useInput } from 'ink';
import React, { useCallback, useRef, useState } from 'react';

import { Footer } from '@/cli/tui/components/footer';
import { NowPlayingPanel } from '@/cli/tui/components/now-playing';
import { QueuePanel } from '@/cli/tui/components/queue-panel';
import { SearchPanel } from '@/cli/tui/components/search-panel';
import { usePlayerState } from '@/cli/tui/use-player-state';
import { type Queue, type Track } from '@/models';
import type { PlaybackService } from '@/services/playback';
import type { QueueService } from '@/services/queue';
import type { SearchService } from '@/services/search';

/** Props for the TUI root {@link App}. */
export interface AppProps {
  readonly playback: PlaybackService;
  readonly queueService: QueueService;
  readonly searchService: SearchService;
  /** Called once on quit (after cleanup). */
  readonly onExit?: () => void;
  /** Poll interval for player state; smaller in tests. */
  readonly tickMs?: number;
  /** Visible list height; smaller in tests. */
  readonly listHeight?: number;
}

const VOLUME_STEP = 5;
const SEEK_STEP_SECONDS = 5;

/** Full-screen TUI root: layout, keyboard handling and mode switching. */
export function App({
  playback,
  queueService,
  searchService,
  onExit,
  tickMs = 500,
  listHeight = 12,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const now = usePlayerState(playback, tickMs);
  const [queue, setQueue] = useState<Queue>(() => queueService.getQueue());
  const [mode, setMode] = useState<'queue' | 'search'>('queue');
  const [selection, setSelection] = useState(() =>
    Math.max(0, queueService.getQueue().currentIndex),
  );
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<readonly Track[]>([]);
  const [searchSelection, setSearchSelection] = useState(0);
  const [searching, setSearching] = useState(false);

  // Input handlers must read the LATEST state — keypresses arriving in
  // quick succession would otherwise see stale render closures.
  const stateRef = useRef({ queue, mode, selection, searchResults, searchSelection });
  stateRef.current = { queue, mode, selection, searchResults, searchSelection };

  const refreshQueue = useCallback(() => {
    const current = queueService.getQueue();
    setQueue(current);
    setSelection((previous) =>
      Math.min(Math.max(0, previous), Math.max(0, current.items.length - 1)),
    );
    queueService.persist();
  }, [queueService]);

  const quit = useCallback(() => {
    onExit?.();
    exit();
  }, [exit, onExit]);

  const runSearch = useCallback(
    async (text: string) => {
      setSearching(true);
      try {
        const results = await searchService.search(text, 'songs', { limit: 15 });
        setSearchResults(results.tracks);
        setSearchSelection(0);
      } finally {
        setSearching(false);
      }
    },
    [searchService],
  );

  useInput((input, key) => {
    if (input === 'q') {
      quit();
      return;
    }
    const current = stateRef.current;

    if (current.mode === 'search') {
      if (key.escape) {
        setMode('queue');
        return;
      }
      if (key.upArrow) {
        setSearchSelection((previous) => Math.max(0, previous - 1));
        return;
      }
      if (key.downArrow) {
        setSearchSelection((previous) =>
          Math.min(Math.max(0, current.searchResults.length - 1), previous + 1),
        );
        return;
      }
      if (key.backspace || key.delete) {
        setSearchText((previous) => previous.slice(0, -1));
        return;
      }
      if (input === 'a') {
        const track = current.searchResults[current.searchSelection];
        if (track !== undefined) {
          queueService.enqueue([track]);
          refreshQueue();
        }
        return;
      }
      if (key.return) {
        const track = current.searchResults[current.searchSelection];
        if (track !== undefined) {
          // Play the selected result; the rest of the results follow in queue.
          const remaining = current.searchResults.filter((candidate) => candidate.id !== track.id);
          void playback.playTracks([track, ...remaining]).then(refreshQueue);
          setMode('queue');
          return;
        }
        if (searchText.trim() !== '') {
          void runSearch(searchText.trim());
        }
        return;
      }
      if (input !== undefined && input !== '' && !key.ctrl && !key.meta) {
        setSearchText((previous) => previous + input);
      }
      return;
    }

    // Queue mode keys.
    if (input === ' ') {
      void playback
        .now()
        .then((state) =>
          state.snapshot.status === 'playing' ? playback.pause() : playback.resume(),
        );
      return;
    }
    if (input === '/') {
      setMode('search');
      setSearchText('');
      setSearchResults([]);
      return;
    }
    if (input === 'n') {
      void playback.next().then(refreshQueue);
      return;
    }
    if (input === 'p') {
      void playback.previous().then(refreshQueue);
      return;
    }
    if (input === 's') {
      queueService.setShuffle(!queueService.getQueue().shuffle);
      refreshQueue();
      return;
    }
    if (input === 'r') {
      queueService.cycleRepeat();
      refreshQueue();
      return;
    }
    if (input === '+' || input === '=') {
      void playback
        .now()
        .then((state) => playback.setVolume(Math.min(100, state.snapshot.volume + VOLUME_STEP)));
      return;
    }
    if (input === '-') {
      void playback
        .now()
        .then((state) => playback.setVolume(Math.max(0, state.snapshot.volume - VOLUME_STEP)));
      return;
    }
    if (key.leftArrow) {
      void playback
        .now()
        .then((state) =>
          playback.seekTo(Math.max(0, state.snapshot.positionSeconds - SEEK_STEP_SECONDS)),
        );
      return;
    }
    if (key.rightArrow) {
      void playback
        .now()
        .then((state) => playback.seekTo(state.snapshot.positionSeconds + SEEK_STEP_SECONDS));
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelection((previous) => Math.max(0, previous - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelection((previous) =>
        Math.min(Math.max(0, current.queue.items.length - 1), previous + 1),
      );
      return;
    }
    if (input === 'd') {
      const item = current.queue.items[current.selection];
      if (item !== undefined) {
        queueService.remove(item.id);
        refreshQueue();
      }
      return;
    }
    if (key.return) {
      const item = current.queue.items[current.selection];
      if (item !== undefined) {
        void playback.playItem(item.id).then(refreshQueue);
      }
    }
  });

  return (
    <Box flexDirection="column" height={listHeight + 9}>
      <NowPlayingPanel now={now} />
      {mode === 'search' ? (
        <SearchPanel
          query={searchText}
          results={searchResults}
          selection={searchSelection}
          searching={searching}
          height={listHeight}
        />
      ) : (
        <QueuePanel queue={queue} selection={selection} height={listHeight} />
      )}
      <Footer mode={mode} />
    </Box>
  );
}
