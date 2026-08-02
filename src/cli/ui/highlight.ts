import chalk from 'chalk';

/**
 * Highlights every occurrence of the query's terms in a text using
 * bold yellow. Matching is case-insensitive and term-based (words
 * shorter than two characters are ignored). The text is never
 * truncated or altered beyond styling.
 */
export function highlightMatches(text: string, query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length >= 2)
    .map(escapeRegExp);
  if (terms.length === 0) {
    return text;
  }
  const pattern = new RegExp(`(${terms.join('|')})`, 'gi');
  return text.replaceAll(pattern, (match) => chalk.bold.yellow(match));
}

/** Escapes regex metacharacters in user input. */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
