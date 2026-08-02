import { mkdir } from 'node:fs/promises';

import type { Command } from 'commander';

import { searchAndPickTrack, type ContextFactory } from '@/commands/helpers';
import { printSuccess, printWarning } from '@/cli/output';
import { createSpinner } from '@/cli/ui/spinner';
import { Tokens } from '@/core/tokens';

/** Registers the `download` command. */
export function registerDownloadCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('download')
    .argument('<query>', 'song to download, e.g. "Fix You"')
    .description('Download a track as an audio file (requires yt-dlp)')
    .action(async (query: string) => {
      const context = await getContext();
      const search = await searchAndPickTrack(context, query);
      if (search === null) {
        printWarning(`No tracks found for "${query}"`);
        return;
      }
      const downloadService = context.container.resolve(Tokens.DownloadService);
      await mkdir(downloadService.directory, { recursive: true });
      const spinner = createSpinner(`Downloading "${search.picked.title}"…`);
      try {
        const result = await downloadService.download(search.picked, {
          onProgress: (percent) => {
            spinner.text = `Downloading "${search.picked.title}"… ${String(Math.round(percent))}%`;
          },
        });
        spinner.succeed();
        printSuccess(`Saved: ${result.filePath}`);
      } catch (error) {
        spinner.fail();
        throw error;
      }
    });
}
