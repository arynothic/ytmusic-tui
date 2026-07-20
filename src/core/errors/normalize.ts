import { AppError } from '@/core/errors/app-error';
import { UnexpectedError } from '@/core/errors/unexpected-error';

/**
 * Normalizes any thrown value into an {@link AppError}.
 * Existing AppErrors pass through untouched; everything else is wrapped
 * in an {@link UnexpectedError} preserving the original as `cause`.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof Error) {
    return new UnexpectedError(error.message, { cause: error });
  }
  return new UnexpectedError(typeof error === 'string' ? error : 'Unknown error', {
    details: { thrownValue: error },
  });
}
