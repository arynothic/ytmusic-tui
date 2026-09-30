import { Text } from 'ink';
import React from 'react';

/** Props for {@link Footer}. */
export interface FooterProps {
  readonly mode: 'queue' | 'search';
}

const QUEUE_HINTS =
  'space play/pause · n next · p prev · ↑↓ select · Enter play · d remove · s shuffle · r repeat · +/- vol · ←→ seek · / search · q quit';
const SEARCH_HINTS =
  'type to search · Enter search/play · Tab enqueue · ↑↓ select · Esc back · Ctrl-C quit';

/** Keybinding hint bar, context-sensitive per mode. */
export function Footer({ mode }: FooterProps): React.JSX.Element {
  return <Text dimColor>{mode === 'search' ? SEARCH_HINTS : QUEUE_HINTS}</Text>;
}
