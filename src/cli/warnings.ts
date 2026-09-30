/**
 * Drops the specific `ExperimentalWarning` Node 22 prints the first time
 * `node:sqlite` is loaded. Later Node versions (24+) no longer emit it.
 * Every other warning is passed through unchanged.
 */
export function silenceSqliteExperimentalWarning(): void {
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, options?: string | { type?: string }) => {
    const type = typeof options === 'string' ? options : options?.type;
    const message = typeof warning === 'string' ? warning : warning.message;
    if (type === 'ExperimentalWarning' && message.includes('SQLite')) {
      return;
    }
    (original as (warning: string | Error, options?: unknown) => void)(warning, options);
  }) as typeof process.emitWarning;
}
