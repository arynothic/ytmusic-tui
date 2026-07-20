import { describe, expect, it } from 'vitest';

import { TokenBucketRateLimiter } from '@/utils/rate-limiter';

describe('TokenBucketRateLimiter', () => {
  it('starts with a full bucket', () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 5,
      refillPerSecond: 1,
      now: () => 0,
    });
    expect(limiter.availableTokens).toBe(5);
  });

  it('serves bursts up to capacity without waiting', async () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 3,
      refillPerSecond: 1,
      now: () => 0,
    });
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(0);
  });

  it('refills over time, capped at capacity', () => {
    let nowMs = 0;
    const limiter = new TokenBucketRateLimiter({
      capacity: 4,
      refillPerSecond: 2,
      now: () => nowMs,
    });
    nowMs = 10_000;
    expect(limiter.availableTokens).toBe(4);
  });

  it('refills partially consumed buckets', async () => {
    let nowMs = 0;
    const limiter = new TokenBucketRateLimiter({
      capacity: 10,
      refillPerSecond: 2,
      now: () => nowMs,
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(8);
    nowMs = 1500;
    expect(limiter.availableTokens).toBe(10);
  });

  it('waits for a refill when the bucket is empty', async () => {
    const limiter = new TokenBucketRateLimiter({ capacity: 1, refillPerSecond: 1000 });
    await limiter.acquire();

    let secondResolved = false;
    const pending = limiter.acquire().then(() => {
      secondResolved = true;
    });
    // The wait is backed by a timer (macrotask), so the second acquire
    // cannot have resolved after a microtask flush alone.
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    await pending;
    expect(secondResolved).toBe(true);
  });

  it('execute acquires a token before running the operation', async () => {
    const limiter = new TokenBucketRateLimiter({
      capacity: 1,
      refillPerSecond: 1000,
      now: () => 0,
    });
    const result = await limiter.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(limiter.availableTokens).toBe(0);
  });
});
