import { describe, expect, it } from 'vitest';

import {
  formatDurationMs,
  formatDurationSeconds,
  formatLyricsTimestamp,
  formatRelativeTime,
} from '@/utils/time';

describe('formatDurationSeconds', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatDurationSeconds(0)).toBe('0:00');
    expect(formatDurationSeconds(9)).toBe('0:09');
    expect(formatDurationSeconds(65)).toBe('1:05');
    expect(formatDurationSeconds(599)).toBe('9:59');
    expect(formatDurationSeconds(3599)).toBe('59:59');
  });

  it('formats hour-long durations as h:mm:ss', () => {
    expect(formatDurationSeconds(3600)).toBe('1:00:00');
    expect(formatDurationSeconds(3723)).toBe('1:02:03');
  });

  it('clamps negative and non-finite input', () => {
    expect(formatDurationSeconds(-5)).toBe('0:00');
    expect(formatDurationSeconds(Number.NaN)).toBe('0:00');
    expect(formatDurationSeconds(Number.POSITIVE_INFINITY)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatDurationSeconds(65.9)).toBe('1:05');
  });
});

describe('formatDurationMs', () => {
  it('converts milliseconds to a duration string', () => {
    expect(formatDurationMs(0)).toBe('0:00');
    expect(formatDurationMs(225_000)).toBe('3:45');
  });
});

describe('formatLyricsTimestamp', () => {
  it('formats mm:ss.cc', () => {
    expect(formatLyricsTimestamp(0)).toBe('00:00.00');
    expect(formatLyricsTimestamp(83_240)).toBe('01:23.24');
    expect(formatLyricsTimestamp(3_599_990)).toBe('59:59.99');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-20T12:00:00Z');
  const secondsAgo = (seconds: number): Date => new Date(now.getTime() - seconds * 1000);

  it('renders recent times as "just now"', () => {
    expect(formatRelativeTime(secondsAgo(3), now)).toBe('just now');
    expect(formatRelativeTime(new Date(now.getTime() + 60_000), now)).toBe('just now');
  });

  it('renders each supported unit with pluralization', () => {
    expect(formatRelativeTime(secondsAgo(45), now)).toBe('45 seconds ago');
    expect(formatRelativeTime(secondsAgo(60), now)).toBe('1 minute ago');
    expect(formatRelativeTime(secondsAgo(120), now)).toBe('2 minutes ago');
    expect(formatRelativeTime(secondsAgo(7200), now)).toBe('2 hours ago');
    expect(formatRelativeTime(secondsAgo(86_400), now)).toBe('1 day ago');
    expect(formatRelativeTime(secondsAgo(5 * 86_400), now)).toBe('5 days ago');
    expect(formatRelativeTime(secondsAgo(60 * 86_400), now)).toBe('2 months ago');
    expect(formatRelativeTime(secondsAgo(400 * 86_400), now)).toBe('1 year ago');
    expect(formatRelativeTime(secondsAgo(900 * 86_400), now)).toBe('2 years ago');
  });
});
