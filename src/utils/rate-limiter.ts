import { sleep } from '@/utils/sleep';

/** Options for {@link TokenBucketRateLimiter}. */
export interface RateLimiterOptions {
  /** Maximum burst size (bucket capacity in tokens). */
  readonly capacity: number;
  /** Tokens regenerated per second. */
  readonly refillPerSecond: number;
  /** Clock in milliseconds, injectable for tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/**
 * Token-bucket rate limiter used to smooth outbound API traffic.
 * Callers `acquire()` a token before each request; acquire resolves
 * immediately while tokens remain and waits for a refill otherwise.
 */
export class TokenBucketRateLimiter {
  readonly #capacity: number;
  readonly #refillPerSecond: number;
  readonly #now: () => number;
  #tokens: number;
  #lastRefillMs: number;

  constructor(options: RateLimiterOptions) {
    this.#capacity = options.capacity;
    this.#refillPerSecond = options.refillPerSecond;
    this.#now = options.now ?? Date.now;
    this.#tokens = options.capacity;
    this.#lastRefillMs = this.#now();
  }

  /** Current number of available tokens after a passive refill. */
  get availableTokens(): number {
    this.#refill();
    return this.#tokens;
  }

  /** Waits until one token is available and consumes it. */
  async acquire(): Promise<void> {
    for (;;) {
      this.#refill();
      if (this.#tokens >= 1) {
        this.#tokens -= 1;
        return;
      }
      const missingTokens = 1 - this.#tokens;
      const waitMs = Math.max(1, (missingTokens / this.#refillPerSecond) * 1000);
      await sleep(waitMs);
    }
  }

  /** Acquires a token, then runs the given operation. */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    return operation();
  }

  #refill(): void {
    const nowMs = this.#now();
    const elapsedSeconds = (nowMs - this.#lastRefillMs) / 1000;
    if (elapsedSeconds <= 0) {
      return;
    }
    this.#tokens = Math.min(this.#capacity, this.#tokens + elapsedSeconds * this.#refillPerSecond);
    this.#lastRefillMs = nowMs;
  }
}
