import { select } from '@inquirer/prompts';

import { artistNames, trackDuration } from '@/cli/ui/format';
import type { Track } from '@/models';

/**
 * Interactive track picker. Non-interactive terminals (pipes, tests)
 * and single-result lists resolve to the first track immediately.
 * Returns null only for empty input.
 */
export async function pickTrack(
  tracks: readonly Track[],
  options: { message?: string; pageSize?: number } = {},
): Promise<Track | null> {
  const first = tracks[0];
  if (first === undefined) {
    return null;
  }
  if (process.stdout.isTTY !== true || tracks.length === 1) {
    return first;
  }
  return select<Track>({
    message: options.message ?? 'Pick a track',
    pageSize: options.pageSize ?? 10,
    choices: tracks.map((track) => ({
      name: `${track.title} — ${artistNames(track)} (${trackDuration(track)})`,
      value: track,
    })),
  });
}

/** Generic interactive picker over arbitrary items with a label function. */
export async function pickItem<T>(
  items: readonly T[],
  options: { label: (item: T) => string; message?: string },
): Promise<T | null> {
  const first = items[0];
  if (first === undefined) {
    return null;
  }
  if (process.stdout.isTTY !== true || items.length === 1) {
    return first;
  }
  return select<T>({
    message: options.message ?? 'Pick one',
    choices: items.map((item) => ({ name: options.label(item), value: item })),
  });
}
