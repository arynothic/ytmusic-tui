import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for download failures. */
export type DownloadErrorCode = 'DOWNLOAD_TOOL_MISSING' | 'DOWNLOAD_FAILED';

/** Raised when a track download cannot be completed. */
export class DownloadError extends AppError {
  readonly code: DownloadErrorCode;
  readonly exitCode: ExitCode;

  constructor(code: DownloadErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.code = code;
    this.exitCode = code === 'DOWNLOAD_TOOL_MISSING' ? ExitCode.Unavailable : ExitCode.General;
  }
}
