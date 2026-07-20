/** Options accepted by every {@link AppError} subclass. */
export interface AppErrorOptions {
  /** Original error that caused this one, if any. */
  readonly cause?: unknown;
  /** Structured context attached for logging and debugging. */
  readonly details?: Record<string, unknown>;
}

/**
 * Base class for every error thrown by ytmusic-cli.
 *
 * Carries a stable, machine-readable `code` plus the process `exitCode`
 * the CLI maps the error to when it reaches the top-level handler.
 */
export abstract class AppError extends Error {
  /** Stable, machine-readable error code (e.g. `"AUTH_REQUIRED"`). */
  abstract readonly code: string;

  /** Process exit code the CLI maps this error to. */
  abstract readonly exitCode: number;

  /** True for expected operational failures; false for programming bugs. */
  readonly isOperational: boolean = true;

  /** Structured context attached for logging and debugging. */
  readonly details: Record<string, unknown> | undefined;

  protected constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = new.target.name;
    this.details = options.details;
  }
}
