/**
 * Converts an abort signal's reason into a proper Error instance.
 */
function abortReasonToError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('Operation aborted');
}

/**
 * Sleeps for the given duration. Rejects early when `signal` aborts.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortReasonToError(signal));
      return;
    }
    const onAbort = (): void => {
      cleanup();
      if (signal !== undefined) {
        reject(abortReasonToError(signal));
      }
    };
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
