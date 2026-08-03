import { Box, Text } from 'ink';
import React from 'react';

import { artistNames, trackDuration } from '@/cli/ui/format';
import type { Track } from '@/models';

/** Props for {@link SearchPanel}. */
export interface SearchPanelProps {
  readonly query: string;
  readonly results: readonly Track[];
  readonly selection: number;
  readonly searching: boolean;
  readonly height: number;
}

/** Search input + results list shown while in search mode. */
export function SearchPanel({
  query,
  results,
  selection,
  searching,
  height,
}: SearchPanelProps): React.JSX.Element {
  const visible = results.slice(0, Math.max(1, height - 2));
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="yellow" paddingX={1}>
      <Text>
        <Text bold color="yellow">
          Search:{' '}
        </Text>
        <Text>{query}</Text>
        <Text dimColor>▌</Text>
      </Text>
      {searching ? <Text dimColor>searching…</Text> : null}
      {!searching && results.length === 0 && query !== '' ? (
        <Text dimColor>no results — Enter to search, Esc to go back</Text>
      ) : null}
      {visible.map((track, index) => (
        <Text
          key={track.id}
          color={index === selection ? 'cyan' : undefined}
          bold={index === selection}
        >
          {index === selection ? '›' : ' '}
          {index + 1}. {track.title} — {artistNames(track)} ({trackDuration(track)})
        </Text>
      ))}
    </Box>
  );
}
