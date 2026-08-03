import { Box, Text } from 'ink';
import React from 'react';

import { artistNames, trackDuration } from '@/cli/ui/format';
import type { Queue } from '@/models';

/** Props for {@link QueuePanel}. */
export interface QueuePanelProps {
  readonly queue: Queue;
  /** Currently highlighted row (keyboard selection). */
  readonly selection: number;
  /** Visible row budget. */
  readonly height: number;
}

/** Scrollable queue list with ▶ (playing) and › (selection) markers. */
export function QueuePanel({ queue, selection, height }: QueuePanelProps): React.JSX.Element {
  const items = queue.items;
  // Keep the selection inside the visible window.
  const windowSize = Math.max(1, height);
  const start = Math.min(
    Math.max(0, selection - Math.floor(windowSize / 2)),
    Math.max(0, items.length - windowSize),
  );
  const visible = items.slice(start, start + windowSize);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold dimColor>
        Queue ({items.length})
      </Text>
      {visible.length === 0 ? (
        <Text dimColor>empty — search with / to add tracks</Text>
      ) : (
        visible.map((item, offset) => {
          const index = start + offset;
          const isCurrent = index === queue.currentIndex;
          const isSelected = index === selection;
          const label = `${item.track.title} — ${artistNames(item.track)} (${trackDuration(item.track)})`;
          return (
            <Text
              key={item.id}
              color={isCurrent ? 'green' : isSelected ? 'cyan' : undefined}
              bold={isSelected}
            >
              {isSelected ? '›' : ' '}
              {isCurrent ? '▶' : ' '}
              {index + 1}. {label}
            </Text>
          );
        })
      )}
    </Box>
  );
}
