import { AppError, type AppErrorOptions } from '@/core/errors/app-error';
import { ExitCode } from '@/core/errors/exit-code';

/** Machine-readable codes for audio player backend failures. */
export type PlayerErrorCode =
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_SPAWN_FAILED'
  | 'PLAYER_IPC_ERROR'
  | 'PLAYER_NO_ACTIVE_SESSION';

/** Raised when no player backend can be used or the active backend fails. */
export class PlayerError extends AppError {
  readonly code: PlayerErrorCode;
  readonly exitCode = ExitCode.Unavailable;

  constructor(code: PlayerErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options);
    this.code = code;
  }
}
