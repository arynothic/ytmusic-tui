import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for YouTube Music API failures. */
export type ApiErrorCode =
  | 'API_RATE_LIMITED'
  | 'API_NOT_FOUND'
  | 'API_FORBIDDEN'
  | 'API_UNAVAILABLE'
  | 'API_UNEXPECTED_RESPONSE';

/** Raised when the YouTube Music backend returns an error or unusable payload. */
export class ApiError extends AppError {
  readonly code: ApiErrorCode;
  readonly exitCode: ExitCode;
  /** HTTP status code returned by the backend, when known. */
  readonly statusCode: number | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: AppErrorOptions & { statusCode?: number } = {},
  ) {
    super(message, options);
    this.code = code;
    this.statusCode = options.statusCode;
    this.exitCode = code === 'API_NOT_FOUND' ? ExitCode.NotFound : ExitCode.Unavailable;
  }
}
