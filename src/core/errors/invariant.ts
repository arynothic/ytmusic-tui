import { AssertionFailedError } from '@/core/errors/assertion-error';

/**
 * Asserts a condition that must hold true by construction.
 * Throws {@link AssertionFailedError} when it does not.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new AssertionFailedError(message);
  }
}
