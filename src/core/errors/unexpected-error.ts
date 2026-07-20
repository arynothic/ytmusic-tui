import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Wraps failures that do not fit any domain category. Never expected. */
export class UnexpectedError extends AppError {
  readonly code = 'UNEXPECTED_ERROR' as const;
  readonly exitCode = ExitCode.Software;
  override readonly isOperational = false;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }
}
