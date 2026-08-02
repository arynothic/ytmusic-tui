import ora, { type Ora } from 'ora';

/**
 * Creates an ora spinner on interactive terminals; when stdout is piped
 * the spinner is disabled so machine-readable output stays clean.
 */
export function createSpinner(text: string): Ora {
  return ora({ text, isEnabled: process.stdout.isTTY === true }).start();
}

/** Runs an async operation under a spinner, succeeding/failing with it. */
export async function withSpinner<T>(text: string, operation: () => Promise<T>): Promise<T> {
  const spinner = createSpinner(text);
  try {
    const result = await operation();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}
