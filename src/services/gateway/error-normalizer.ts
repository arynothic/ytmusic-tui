import {
  ApiError,
  AppError,
  AuthError,
  NetworkError,
} from '@/core/errors';

/** Extracts a 4xx/5xx HTTP status code from an error message, when present. */
function extractStatusCode(message: string): number | undefined {
  const match = /\b([45]\d{2})\b/.exec(message);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const status = Number.parseInt(match[1], 10);
  return Number.isNaN(status) ? undefined : status;
}

const NETWORK_PATTERN =
  /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|network/i;

/**
 * Translates vendor client failures into the AppError taxonomy.
 * AppErrors pass through untouched; transport failures become
 * NetworkError (retryable); HTTP-ish failures map by status code.
 */
export function normalizeClientError(error: unknown, context: string): AppError {
  if (error instanceof AppError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof TypeError || NETWORK_PATTERN.test(message)) {
    return new NetworkError('NETWORK_UNREACHABLE', `${context}: ${message}`, { cause: error });
  }

  const status = extractStatusCode(message);
  if (status !== undefined) {
    if (status === 401) {
      return new AuthError(
        'AUTH_INVALID_CREDENTIALS',
        `${context}: session rejected (401). Your cookies may have expired — run \`ytmusic login\` again.`,
        { cause: error },
      );
    }
    if (status === 403) {
      return new ApiError('API_FORBIDDEN', `${context}: access denied (403)`, {
        cause: error,
        statusCode: status,
      });
    }
    if (status === 404) {
      return new ApiError('API_NOT_FOUND', `${context}: not found (404)`, {
        cause: error,
        statusCode: status,
      });
    }
    if (status === 429) {
      return new ApiError('API_RATE_LIMITED', `${context}: rate limited (429)`, {
        cause: error,
        statusCode: status,
      });
    }
    if (status >= 500) {
      return new ApiError('API_UNAVAILABLE', `${context}: backend error (${String(status)})`, {
        cause: error,
        statusCode: status,
      });
    }
  }

  return new ApiError('API_UNEXPECTED_RESPONSE', `${context}: ${message}`, { cause: error });
}
