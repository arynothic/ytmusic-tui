import { ApiError } from '@/core/errors/api-error';
import { NetworkError } from '@/core/errors/network-error';

/**
 * Classifies whether an error is transient and the failed operation
 * is safe to retry (transport failures, rate limiting, 5xx-style outages).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof ApiError) {
    return error.code === 'API_RATE_LIMITED' || error.code === 'API_UNAVAILABLE';
  }
  return false;
}
