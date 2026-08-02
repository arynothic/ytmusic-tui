import { readFile } from 'node:fs/promises';

import { input } from '@inquirer/prompts';
import type { Command } from 'commander';

import type { ContextFactory } from '@/commands/helpers';
import { printLine, printSuccess } from '@/cli/output';
import { withSpinner } from '@/cli/ui/spinner';
import { ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';

const LOGIN_INSTRUCTIONS = [
  'To log in, paste your YouTube Music cookies:',
  '',
  '  1. Open https://music.youtube.com in your browser and log in.',
  '  2. Open DevTools (F12) → Network tab.',
  '  3. Reload the page, click any request to music.youtube.com.',
  '  4. Copy the full "Cookie" request header value and paste it below.',
  '',
  'Alternatively: ytmusic login --cookie "<header>" or --file cookies.txt',
];

/** Registers the `login` and `logout` commands. */
export function registerAuthCommands(program: Command, getContext: ContextFactory): void {
  program
    .command('login')
    .option('--cookie <cookie>', 'full Cookie header value')
    .option('--file <path>', 'Netscape cookies.txt export')
    .description('Log in to YouTube Music with browser cookies')
    .action(async (options: { cookie?: string; file?: string }) => {
      const cookieInput = await resolveCookieInput(options);
      const context = await getContext();
      const authService = context.container.resolve(Tokens.AuthService);
      const credentials = await withSpinner('Validating session…', () =>
        authService.loginWithCookieExport(cookieInput),
      );
      printSuccess(
        credentials.userName !== undefined ? `Logged in as ${credentials.userName}` : 'Logged in',
      );
    });

  program
    .command('logout')
    .description('Log out and remove stored credentials')
    .action(async () => {
      const context = await getContext();
      await context.container.resolve(Tokens.AuthService).logout();
      printSuccess('Logged out');
    });
}

/** Determines the cookie input from flags or an interactive prompt. */
async function resolveCookieInput(options: { cookie?: string; file?: string }): Promise<string> {
  if (options.cookie !== undefined) {
    return options.cookie;
  }
  if (options.file !== undefined) {
    return readFile(options.file, 'utf8');
  }
  if (process.stdout.isTTY !== true) {
    throw new ValidationError(
      'Cookie input required: pass --cookie "<header>" or --file cookies.txt',
    );
  }
  for (const line of LOGIN_INSTRUCTIONS) {
    printLine(line);
  }
  const answer = await input({ message: 'Cookie header:' });
  if (answer.trim() === '') {
    throw new ValidationError('Empty cookie input');
  }
  return answer;
}
