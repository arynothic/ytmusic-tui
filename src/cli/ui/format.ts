import type { Track } from '@/models';
import { formatDurationSeconds } from '@/utils';

/** Joins a track's artist names into one display string. */
export function artistNames(track: Track): string {
  const names = track.artists.map((artist) => artist.name).filter((name) => name !== '');
  return names.length > 0 ? names.join(', ') : 'Unknown artist';
}

/** One-line track label: "Title — Artist (3:45)". */
export function trackLabel(track: Track): string {
  const duration =
    track.durationSeconds !== null ? ` (${formatDurationSeconds(track.durationSeconds)})` : '';
  return `${track.title} — ${artistNames(track)}${duration}`;
}

/** Formats a track's duration or an em-dash when unknown. */
export function trackDuration(track: Track): string {
  return track.durationSeconds !== null ? formatDurationSeconds(track.durationSeconds) : '—';
}

/** Truncates a string to a maximum display width with an ellipsis. */
export function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxWidth - 1))}…`;
}
