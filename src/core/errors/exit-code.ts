/**
 * Process exit codes used by the CLI, following sysexits(3) conventions
 * where applicable so the binary composes well in shell scripts.
 */
export const ExitCode = {
  Success: 0,
  General: 1,
  /** Command-line usage problem (EX_USAGE). */
  Usage: 64,
  /** Requested entity was not found (EX_NOINPUT). */
  NotFound: 66,
  /** External service/tool unavailable (EX_UNAVAILABLE). */
  Unavailable: 69,
  /** Internal software error (EX_SOFTWARE). */
  Software: 70,
  /** I/O failure (EX_IOERR). */
  IoError: 74,
  /** Permission/credential problem (EX_NOPERM). */
  Auth: 77,
  /** Configuration problem (EX_CONFIG). */
  Config: 78,
} as const;

/** Union of all valid exit code values. */
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
