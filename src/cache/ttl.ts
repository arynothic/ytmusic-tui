/** Computes an expiry timestamp (epoch ms) from a TTL in milliseconds. */
export function computeExpiry(ttlMs: number, now: number = Date.now()): number {
  return now + ttlMs;
}

/** True when `expiresAt` (epoch ms) is in the past relative to `now`. */
export function isExpired(expiresAt: number, now: number = Date.now()): boolean {
  return now >= expiresAt;
}
