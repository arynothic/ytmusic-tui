import { Text } from 'ink';
import React from 'react';

/** Props for {@link ProgressBar}. */
export interface ProgressBarProps {
  /** Progress between 0 and 1. */
  readonly ratio: number;
  /** Bar width in characters. */
  readonly width?: number;
}

/** Renders a unicode-block progress bar: ████████────────── */
export function ProgressBar({ ratio, width = 20 }: ProgressBarProps): React.JSX.Element {
  const clamped = Math.min(1, Math.max(0, ratio));
  const filled = Math.round(clamped * width);
  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text dimColor>{'─'.repeat(Math.max(0, width - filled))}</Text>
    </Text>
  );
}
