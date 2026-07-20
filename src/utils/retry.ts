import { sleep } from '@/utils/sleep';

/** Options controlling {@link withRetry} behavior. */
export interface RetryOptions {
  /** Maximum total attempts, including the first try. Defaults to 3. */
  readonly attempts?: number;
  /** Base backoff delay in milliseconds. Defaults to 250. */
  readonly baseDelayMs?: number;
  /** Upper bound for the backoff delay in milliseconds. Defaults to 5000. */
  readonly maxDelayMs?: number;
  /** Decides whether a failure may be retried. Defaults to retrying everything. */
  readonly isRetryable?: (error: unknown) => boolean;
  /** Called before each retry wait. */
  readonly onRetry?: (info: { attempt: number; error: unknown; delayMs: number }) => void;
  /** Cancels pending retry waits when aborted. */
  readonly signal?: AbortSignal;
  /** Sleep implementation, injectable for tests. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Random source for jitter, injectable for tests. Defaults to `Math.random`. */
  readonly random?: () => number;
}

/**
 * Computes the backoff delay for a zero-based retry index using
 * exponential backoff with full jitter (AWS architecture blog style).
 */
export function computeBackoffDelay(
  retryIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** retryIndex);
  return Math.floor(random() * ceiling);
}

/**
 * Runs an async operation, retrying failures with exponential backoff
 * and full jitter. The last error is rethrown when attempts run out or
 * when `isRetryable` rejects it.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 250,
    maxDelayMs = 5000,
    isRetryable = () => true,
    onRetry,
    signal,
    sleep: sleepImpl = sleep,
    random = Math.random,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) {
        throw error;
      }
      const delayMs = computeBackoffDelay(attempt - 1, baseDelayMs, maxDelayMs, random);
      onRetry?.({ attempt, error, delayMs });
      await sleepImpl(delayMs, signal);
    }
  }
  throw lastError;
}
