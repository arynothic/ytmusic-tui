import chalk from 'chalk';

/** Writes a line to stdout. The ONLY place CLI output should originate. */
export function printLine(text = ''): void {
  process.stdout.write(`${text}\n`);
}

/** Writes a line to stderr. */
export function printErrorLine(text: string): void {
  process.stderr.write(`${text}\n`);
}

/** Prints aligned, colorized `key  value` pairs. */
export function printKeyValues(entries: Record<string, string>): void {
  const keys = Object.keys(entries);
  const width = Math.max(0, ...keys.map((key) => key.length));
  for (const key of keys) {
    printLine(`${chalk.cyan(key.padEnd(width))}  ${entries[key] ?? ''}`);
  }
}

/** Prints a green success line with a check mark. */
export function printSuccess(text: string): void {
  printLine(`${chalk.green('✓')} ${text}`);
}

/** Prints a yellow warning line. */
export function printWarning(text: string): void {
  printLine(`${chalk.yellow('⚠')} ${chalk.yellow(text)}`);
}
