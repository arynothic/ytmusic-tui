import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for configuration failures. */
export type ConfigErrorCode = 'CONFIG_NOT_FOUND' | 'CONFIG_INVALID' | 'CONFIG_WRITE_FAILED';

/** Raised when configuration cannot be located, parsed, or persisted. */
export class ConfigError extends AppError {
  readonly code: ConfigErrorCode;
  readonly exitCode = ExitCode.Config;

  constructor(code: ConfigErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.code = code;
  }
}
