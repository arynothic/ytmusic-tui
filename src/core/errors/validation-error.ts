import type { ZodError } from 'zod';

import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Raised when input or boundary data fails schema validation. */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_FAILED' as const;
  readonly exitCode = ExitCode.Usage;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options);
  }

  /**
   * Builds a ValidationError from a zod failure, flattening issues into
   * human-readable `"path: message"` fragments.
   */
  static fromZodError(zodError: ZodError, context: string): ValidationError {
    const issues = zodError.issues.map(
      (issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`,
    );
    return new ValidationError(`${context} — ${issues.join('; ')}`, { details: { issues } });
  }
}
