import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for local persistence failures. */
export type CacheErrorCode = 'CACHE_OPEN_FAILED' | 'CACHE_QUERY_FAILED' | 'CACHE_CORRUPT';

/** Raised when the SQLite cache/history databases cannot serve a request. */
export class CacheError extends AppError {
  readonly code: CacheErrorCode;
  readonly exitCode = ExitCode.IoError;

  constructor(code: CacheErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.code = code;
  }
}
