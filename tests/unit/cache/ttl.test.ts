import { describe, expect, it } from 'vitest';

import { computeExpiry, isExpired } from '@/cache/ttl';

describe('ttl helpers', () => {
  it('computes expiry from a ttl and now', () => {
    expect(computeExpiry(1000, 5000)).toBe(6000);
  });

  it('detects expiry relative to now', () => {
    expect(isExpired(999, 1000)).toBe(true);
    expect(isExpired(1000, 1000)).toBe(true);
    expect(isExpired(1001, 1000)).toBe(false);
  });
});
