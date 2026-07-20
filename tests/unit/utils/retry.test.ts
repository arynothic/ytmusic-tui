import { describe, expect, it } from 'vitest';

import { computeBackoffDelay, withRetry } from '@/utils/retry';
import { sleep } from '@/utils/sleep';

/** Sleep double that records requested delays and resolves immediately. */
function createFakeSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

describe('computeBackoffDelay', () => {
  it('grows exponentially and is capped by maxDelayMs', () => {
    const random = (): number => 0.999;
    expect(computeBackoffDelay(0, 100, 1000, random)).toBe(99);
    expect(computeBackoffDelay(1, 100, 1000, random)).toBe(199);
    expect(computeBackoffDelay(2, 100, 1000, random)).toBe(399);
    expect(computeBackoffDelay(10, 100, 1000, random)).toBe(999);
  });

  it('applies full jitter within [0, ceiling)', () => {
    expect(computeBackoffDelay(0, 100, 1000, () => 0)).toBe(0);
    const delay = computeBackoffDelay(0, 100, 1000, () => 0.5);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThan(100);
  });
});

describe('withRetry', () => {
  it('returns immediately on first success', async () => {
    let calls = 0;
    const result = await withRetry(() => {
      calls += 1;
      return Promise.resolve('ok');
    });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries failures until the operation succeeds', async () => {
    const fake = createFakeSleep();
    let calls = 0;
    const result = await withRetry(
      () => {
        calls += 1;
        return calls < 3 ? Promise.reject(new Error(`fail ${String(calls)}`)) : Promise.resolve(7);
      },
      { sleep: fake.sleep, random: () => 0.5, baseDelayMs: 100, maxDelayMs: 1000 },
    );
    expect(result).toBe(7);
    expect(calls).toBe(3);
    expect(fake.delays).toEqual([50, 100]);
  });

  it('rethrows the last error when attempts run out', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls += 1;
          return Promise.reject(new Error(`fail ${String(calls)}`));
        },
        { attempts: 2, sleep: createFakeSleep().sleep },
      ),
    ).rejects.toThrowError('fail 2');
    expect(calls).toBe(2);
  });

  it('does not retry errors rejected by isRetryable', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls += 1;
          return Promise.reject(new Error('fatal'));
        },
        { isRetryable: () => false, sleep: createFakeSleep().sleep },
      ),
    ).rejects.toThrowError('fatal');
    expect(calls).toBe(1);
  });

  it('notifies onRetry with attempt, error and planned delay', async () => {
    const seen: Array<{ attempt: number; delayMs: number }> = [];
    await expect(
      withRetry(() => Promise.reject(new Error('always')), {
        attempts: 3,
        sleep: createFakeSleep().sleep,
        random: () => 0.5,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        onRetry: (info) => {
          seen.push({ attempt: info.attempt, delayMs: info.delayMs });
        },
      }),
    ).rejects.toThrowError('always');
    expect(seen).toEqual([
      { attempt: 1, delayMs: 50 },
      { attempt: 2, delayMs: 100 },
    ]);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRetry(() => Promise.resolve('never'), { signal: controller.signal }),
    ).rejects.toThrowError();
  });

  it('rejects when the signal aborts during a retry wait', async () => {
    const controller = new AbortController();
    const abortingSleep = (ms: number, signal?: AbortSignal): Promise<void> => {
      controller.abort();
      return sleep(ms, signal);
    };
    await expect(
      withRetry(() => Promise.reject(new Error('transient')), {
        attempts: 3,
        sleep: abortingSleep,
      }),
    ).rejects.toThrowError();
  });
});
