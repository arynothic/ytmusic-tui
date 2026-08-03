import { describe, expect, it } from 'vitest';

import { createSpinner, withSpinner } from '@/cli/ui/spinner';

describe('spinner', () => {
  it('creates a disabled spinner on non-TTY stdout', () => {
    const spinner = createSpinner('working');
    // Piped in tests → disabled; still safe to call all lifecycle methods.
    spinner.succeed();
    spinner.fail();
    expect(spinner.isSpinning).toBe(false);
  });

  it('withSpinner returns the result and succeeds the spinner', async () => {
    await expect(withSpinner('working', () => Promise.resolve(42))).resolves.toBe(42);
  });

  it('withSpinner rethrows failures', async () => {
    await expect(withSpinner('working', () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
  });
});
