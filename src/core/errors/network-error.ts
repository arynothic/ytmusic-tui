import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for transport-level failures. Always retryable. */
export type NetworkErrorCode = 'NETWORK_UNREACHABLE' | 'NETWORK_TIMEOUT';

/** Raised when an HTTP request fails at the transport level. */
export class NetworkError extends AppError {
  readonly code: NetworkErrorCode;
  readonly exitCode = ExitCode.Unavailable;

  constructor(code: NetworkErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.code = code;
  }
}
