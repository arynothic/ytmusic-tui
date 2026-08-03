import { Box, Text } from 'ink';
import React from 'react';

import { ProgressBar } from '@/cli/tui/components/progress-bar';
import { artistNames } from '@/cli/ui/format';
import type { NowPlaying } from '@/services/playback';
import { formatDurationSeconds } from '@/utils';

/** Props for {@link NowPlayingPanel}. */
export interface NowPlayingPanelProps {
  readonly now: NowPlaying | null;
}

const STATUS_LABEL: Record<string, string> = {
  playing: '▶ Playing',
  paused: '⏸ Paused',
  stopped: '⏹ Stopped',
  loading: '… Loading',
  idle: '■ Idle',
};

/** Header panel: status, track, progress and volume. */
export function NowPlayingPanel({ now }: NowPlayingPanelProps): React.JSX.Element {
  const track = now?.snapshot.track ?? now?.item?.track ?? null;
  const status = now?.snapshot.status ?? 'idle';
  const position = now?.snapshot.positionSeconds ?? 0;
  const duration = track?.durationSeconds ?? null;
  const ratio = duration !== null && duration > 0 ? position / duration : 0;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ytmusic
        </Text>
        <Text color={status === 'playing' ? 'green' : 'yellow'}>
          {STATUS_LABEL[status] ?? status}
        </Text>
      </Box>
      {track === null ? (
        <Text dimColor>Nothing is playing — press / to search</Text>
      ) : (
        <>
          <Text>
            <Text bold>{track.title}</Text>
            <Text dimColor> — {artistNames(track)}</Text>
          </Text>
          <Box gap={1}>
            <ProgressBar ratio={ratio} width={24} />
            <Text dimColor>
              {formatDurationSeconds(position)} /{' '}
              {duration !== null ? formatDurationSeconds(duration) : '—'}
            </Text>
            <Text dimColor>vol {now?.snapshot.volume ?? 0}</Text>
            {now !== null && now.total > 0 ? (
              <Text dimColor>
                {now.position}/{now.total}
                {now.shuffle ? ' · shuffle' : ''}
                {now.repeat !== 'off' ? ` · repeat ${now.repeat}` : ''}
              </Text>
            ) : null}
          </Box>
        </>
      )}
    </Box>
  );
}
