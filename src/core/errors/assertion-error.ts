import { AppError } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Raised when an internal invariant is violated — always a bug. */
export class AssertionFailedError extends AppError {
  readonly code = 'ASSERTION_FAILED' as const;
  readonly exitCode = ExitCode.Software;
  override readonly isOperational = false;

  constructor(message: string) {
    super(message);
  }
}
