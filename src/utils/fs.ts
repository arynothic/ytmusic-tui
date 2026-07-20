/** True when `error` is an ErrnoException carrying the given code (e.g. "ENOENT"). */
export function isErrnoException(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
