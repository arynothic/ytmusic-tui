import pino, { type LevelWithSilent, type Logger } from 'pino';

/** Options for {@link createLogger}. */
export interface LoggerOptions {
  /** Minimum level to emit. */
  readonly level: LevelWithSilent;
  /** When set, JSON log lines are appended to this file (dirs created). */
  readonly logFile?: string;
  /** Pretty-print to stderr for interactive development. */
  readonly pretty?: boolean;
}

/**
 * Creates the root application logger. A CLI must never pollute stdout
 * with logs, so output goes to a file, pretty stderr, or is disabled.
 */
export function createLogger(options: LoggerOptions): Logger {
  const pinoOptions = { level: options.level, base: { app: 'ytmusic-cli' } };
  if (options.pretty === true) {
    return pino(
      pinoOptions,
      pino.transport({
        target: 'pino-pretty',
        options: { destination: 2, colorize: true },
      }),
    );
  }
  if (options.logFile !== undefined) {
    return pino(pinoOptions, pino.destination({ dest: options.logFile, mkdir: true, sync: true }));
  }
  return pino({ ...pinoOptions, enabled: false });
}

/** Creates a named child logger for a module. */
export function createChildLogger(logger: Logger, moduleName: string): Logger {
  return logger.child({ module: moduleName });
}
