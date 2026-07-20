import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for stream URL resolution failures. */
export type StreamErrorCode = 'STREAM_RESOLVER_MISSING' | 'STREAM_RESOLVE_FAILED';

/** Raised when a playable audio URL cannot be produced for a track. */
export class StreamError extends AppError {
  readonly code: StreamErrorCode;
  readonly exitCode = ExitCode.Unavailable;

  constructor(code: StreamErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.code = code;
  }
}
