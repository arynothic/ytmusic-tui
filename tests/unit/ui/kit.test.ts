import chalk from 'chalk';
import { describe, expect, it } from 'vitest';

import { printKeyValues, printLine, printSuccess, printWarning } from '@/cli/output';
import { artistNames, trackDuration, trackLabel, truncate } from '@/cli/ui/format';
import { highlightMatches } from '@/cli/ui/highlight';
import { createTrackFixture } from '../../helpers/fixtures';
import { captureStdout } from '../../helpers/test-context';

describe('output helpers', () => {
  it('printKeyValues aligns keys and printSuccess/printWarning format icons', () => {
    const stdout = captureStdout();
    try {
      printKeyValues({ alpha: '1', longerkey: '2' });
      printSuccess('done');
      printWarning('careful');
      printLine('plain');
    } finally {
      stdout.restore();
    }
    const text = stdout.text();
    expect(text).toContain('alpha');
    expect(text).toContain('longerkey');
    expect(text).toContain('done');
    expect(text).toContain('careful');
    expect(text).toContain('plain');
  });
});

describe('highlightMatches', () => {
  it('highlights query terms case-insensitively', () => {
    const highlighted = highlightMatches('Fix You by Coldplay', 'fix');
    expect(highlighted).toContain('Fix');
  });

  it('styles matches when colors are enabled', () => {
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const highlighted = highlightMatches('Fix You', 'fix');
      expect(highlighted).toContain('');
    } finally {
      chalk.level = previousLevel;
    }
  });

  it('ignores short terms and regex metacharacters', () => {
    expect(highlightMatches('a b c', 'a')).toBe('a b c');
    expect(highlightMatches('a.b', 'a.b')).toContain('a.b');
  });

  it('returns text unchanged for empty queries', () => {
    expect(highlightMatches('hello', '   ')).toBe('hello');
  });
});

describe('format helpers', () => {
  it('formats track labels with duration and artists', () => {
    const track = createTrackFixture({ title: 'Fix You', durationSeconds: 295 });
    expect(trackLabel(track)).toBe('Fix You — Rick Astley (4:55)');
    expect(trackDuration(track)).toBe('4:55');
  });

  it('handles missing artists and durations', () => {
    const track = createTrackFixture({ artists: [], durationSeconds: null });
    expect(artistNames(track)).toBe('Unknown artist');
    expect(trackDuration(track)).toBe('—');
    expect(trackLabel(track)).toContain('Unknown artist');
    expect(trackLabel(track)).not.toContain('(');
  });

  it('truncates long text with an ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a very long title indeed', 10)).toBe('a very lo…');
  });
});
