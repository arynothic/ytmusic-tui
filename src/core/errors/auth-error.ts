import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for authentication/authorization failures. */
export type AuthErrorCode =
  'AUTH_REQUIRED' | 'AUTH_INVALID_CREDENTIALS' | 'AUTH_SESSION_EXPIRED' | 'AUTH_STORE_UNAVAILABLE';

/** Raised for login, credential storage, and session failures. */
export class AuthError extends AppError {
  readonly code: AuthErrorCode;
  readonly exitCode = ExitCode.Auth;

  constructor(code: AuthErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.code = code;
  }
}
