import { Box, Text, useApp, useInput, useStdout } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Footer } from '@/cli/tui/components/footer';
import { NowPlayingPanel } from '@/cli/tui/components/now-playing';
import { QueuePanel } from '@/cli/tui/components/queue-panel';
import { SearchPanel } from '@/cli/tui/components/search-panel';
import { usePlayerState } from '@/cli/tui/use-player-state';
import { toAppError } from '@/core/errors';
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
  /** Visible list height; defaults to the terminal size. */
  readonly listHeight?: number;
}

const VOLUME_STEP = 5;
const SEEK_STEP_SECONDS = 5;
/** Rows consumed by the header, borders and footer. */
const CHROME_ROWS = 9;
const MIN_LIST_ROWS = 3;
const DEFAULT_LIST_ROWS = 12;

/** Full-screen TUI root: layout, keyboard handling and mode switching. */
export function App({
  playback,
  queueService,
  searchService,
  onExit,
  tickMs = 500,
  listHeight,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const now = usePlayerState(playback, tickMs);
  const [queue, setQueue] = useState<Queue>(() => queueService.getQueue());
  const [mode, setMode] = useState<'queue' | 'search'>('queue');
  const [selection, setSelection] = useState(() =>
    Math.max(0, queueService.getQueue().currentIndex),
  );
  const [searchText, setSearchText] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<readonly Track[]>([]);
  const [searchSelection, setSearchSelection] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = stdout?.rows;
  const listRows =
    listHeight ??
    (rows !== undefined ? Math.max(MIN_LIST_ROWS, rows - CHROME_ROWS) : DEFAULT_LIST_ROWS);

  // Input handlers must read the LATEST state — keypresses arriving in
  // quick succession would otherwise see stale render closures.
  const stateRef = useRef({
    queue,
    mode,
    selection,
    searchText,
    searchedQuery,
    searchResults,
    searchSelection,
  });
  stateRef.current = {
    queue,
    mode,
    selection,
    searchText,
    searchedQuery,
    searchResults,
    searchSelection,
  };

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

  /** Runs an async action, surfacing failures instead of crashing the UI. */
  const run = useCallback((action: () => Promise<unknown>, onDone?: () => void) => {
    action()
      .then(() => {
        setError(null);
        onDone?.();
      })
      .catch((cause: unknown) => {
        setError(toAppError(cause).message);
      });
  }, []);

  const runSearch = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === '') {
        return;
      }
      setSearching(true);
      setError(null);
      searchService
        .search(trimmed, 'songs', { limit: 15 })
        .then((results) => {
          setSearchResults(results.tracks);
          setSearchSelection(0);
          setSearchedQuery(trimmed);
        })
        .catch((cause: unknown) => {
          setError(toAppError(cause).message);
        })
        .finally(() => {
          setSearching(false);
        });
    },
    [searchService],
  );

  const playTrack = useCallback(
    (track: Track, rest: readonly Track[]) => {
      run(
        () => playback.playTracks([track, ...rest]),
        () => {
          refreshQueue();
          setMode('queue');
        },
      );
    },
    [playback, refreshQueue, run],
  );

  // Keep the queue panel in sync when playback auto-advances in the
  // background (the queue is owned by QueueService, not React state).
  const currentItemId = now?.item?.id ?? null;
  useEffect(() => {
    setQueue(queueService.getQueue());
  }, [currentItemId, queueService]);

  useInput((input, key) => {
    const current = stateRef.current;

    if (current.mode === 'search') {
      if (key.escape) {
        setMode('queue');
        setError(null);
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
      if (key.tab) {
        const track = current.searchResults[current.searchSelection];
        if (track !== undefined) {
          run(() => {
            queueService.enqueue([track]);
            refreshQueue();
            return Promise.resolve();
          });
        }
        return;
      }
      if (key.return) {
        if (
          current.searchResults.length > 0 &&
          current.searchedQuery === current.searchText.trim()
        ) {
          const track = current.searchResults[current.searchSelection];
          if (track !== undefined) {
            const rest = current.searchResults.filter((candidate) => candidate.id !== track.id);
            playTrack(track, rest);
          }
          return;
        }
        runSearch(current.searchText);
        return;
      }
      if (input !== undefined && input !== '' && !key.ctrl && !key.meta) {
        const next = current.searchText + input;
        setSearchText(next);
        // A changed query invalidates the previous result set.
        setSearchedQuery('');
        return;
      }
      return;
    }

    // Queue mode.
    if (input === 'q') {
      quit();
      return;
    }
    if (input === ' ') {
      run(() =>
        playback
          .now()
          .then((state) =>
            state.snapshot.status === 'playing' ? playback.pause() : playback.resume(),
          ),
      );
      return;
    }
    if (input === '/') {
      setMode('search');
      setSearchText('');
      setSearchedQuery('');
      setSearchResults([]);
      setError(null);
      return;
    }
    if (input === 'n') {
      run(
        () => playback.next(),
        () => refreshQueue(),
      );
      return;
    }
    if (input === 'p') {
      run(
        () => playback.previous(),
        () => refreshQueue(),
      );
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
      run(() =>
        playback
          .now()
          .then((state) => playback.setVolume(Math.min(100, state.snapshot.volume + VOLUME_STEP))),
      );
      return;
    }
    if (input === '-') {
      run(() =>
        playback
          .now()
          .then((state) => playback.setVolume(Math.max(0, state.snapshot.volume - VOLUME_STEP))),
      );
      return;
    }
    if (key.leftArrow) {
      run(() =>
        playback
          .now()
          .then((state) =>
            playback.seekTo(Math.max(0, state.snapshot.positionSeconds - SEEK_STEP_SECONDS)),
          ),
      );
      return;
    }
    if (key.rightArrow) {
      run(() =>
        playback
          .now()
          .then((state) => playback.seekTo(state.snapshot.positionSeconds + SEEK_STEP_SECONDS)),
      );
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
        run(
          () => playback.playItem(item.id),
          () => refreshQueue(),
        );
      }
    }
  });

  return (
    <Box flexDirection="column">
      <NowPlayingPanel now={now} />
      {mode === 'search' ? (
        <SearchPanel
          query={searchText}
          results={searchResults}
          selection={searchSelection}
          searching={searching}
          height={listRows}
        />
      ) : (
        <QueuePanel queue={queue} selection={selection} height={listRows} />
      )}
      {error !== null ? <Text color="red">✖ {error}</Text> : null}
      <Footer mode={mode} />
    </Box>
  );
}
