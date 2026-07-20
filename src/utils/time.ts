/**
 * Formats a duration in seconds as `m:ss`, or `h:mm:ss` when >= 1 hour.
 * Negative and non-finite input clamps to `0:00`.
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const clamped = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${String(hours)}:${String(minutes).padStart(2, '0')}:${ss}`;
  }
  return `${String(minutes)}:${ss}`;
}

/** Formats a duration in milliseconds using {@link formatDurationSeconds}. */
export function formatDurationMs(ms: number): string {
  return formatDurationSeconds(ms / 1000);
}

/** Formats milliseconds as a lyrics timestamp `mm:ss.cc` (centiseconds). */
export function formatLyricsTimestamp(ms: number): string {
  const clamped = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const centiseconds = Math.floor((clamped % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

const RELATIVE_STEPS: ReadonlyArray<{ limitSeconds: number; divisor: number; unit: string }> = [
  { limitSeconds: 60, divisor: 1, unit: 'second' },
  { limitSeconds: 3600, divisor: 60, unit: 'minute' },
  { limitSeconds: 86_400, divisor: 3600, unit: 'hour' },
  { limitSeconds: 2_592_000, divisor: 86_400, unit: 'day' },
  { limitSeconds: 31_536_000, divisor: 2_592_000, unit: 'month' },
];

/**
 * Formats a past date relative to `now` (e.g. `"3 days ago"`).
 * Dates in the future render as `"just now"`.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSeconds < 10) {
    return 'just now';
  }
  for (const step of RELATIVE_STEPS) {
    if (diffSeconds < step.limitSeconds) {
      const value = Math.floor(diffSeconds / step.divisor);
      return `${String(value)} ${step.unit}${value === 1 ? '' : 's'} ago`;
    }
  }
  const years = Math.floor(diffSeconds / 31_536_000);
  return `${String(years)} year${years === 1 ? '' : 's'} ago`;
}
