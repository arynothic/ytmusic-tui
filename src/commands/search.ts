import type { Command } from 'commander';

import type { ContextFactory } from '@/commands/helpers';
import { printLine, printWarning } from '@/cli/output';
import {
  printAlbumsTable,
  printArtistsTable,
  printPlaylistsTable,
  printSection,
  printTracksTable,
} from '@/cli/ui/table';
import { withSpinner } from '@/cli/ui/spinner';
import { ValidationError } from '@/core/errors';
import { Tokens } from '@/core/tokens';
import { SearchFilterSchema, type SearchFilter } from '@/models';

/** Registers the `search` command. */
export function registerSearchCommand(program: Command, getContext: ContextFactory): void {
  program
    .command('search')
    .argument('<query>', 'search query, e.g. "Coldplay"')
    .option('-t, --type <type>', 'filter: songs|videos|albums|artists|playlists|podcasts')
    .option('-l, --limit <number>', 'maximum results per category', '10')
    .description('Search YouTube Music')
    .action(async (query: string, options: { type?: string; limit: string }) => {
      const filter = parseFilter(options.type);
      const limit = parseLimit(options.limit);
      const context = await getContext();
      const searchService = context.container.resolve(Tokens.SearchService);

      const results = await withSpinner(`Searching for "${query}"…`, () =>
        searchService.search(query, filter, { limit }),
      );

      printLine('');
      printLine(`Results for "${query}"${filter !== null ? ` (${filter})` : ''}:`);
      let printed = 0;
      if (results.tracks.length > 0) {
        printSection(filter === 'videos' ? 'Videos' : 'Songs');
        printTracksTable(results.tracks, { query });
        printed += results.tracks.length;
      }
      if (results.albums.length > 0) {
        printSection('Albums');
        printAlbumsTable(results.albums, { query });
        printed += results.albums.length;
      }
      if (results.artists.length > 0) {
        printSection('Artists');
        printArtistsTable(results.artists, { query });
        printed += results.artists.length;
      }
      if (results.playlists.length > 0) {
        printSection(filter === 'podcasts' ? 'Podcasts' : 'Playlists');
        printPlaylistsTable(results.playlists, { query });
        printed += results.playlists.length;
      }
      if (printed === 0) {
        printWarning(`No results for "${query}"`);
      }
    });
}

/** Validates the --type option against the SearchFilter enum. */
function parseFilter(raw: string | undefined): SearchFilter | null {
  if (raw === undefined) {
    return null;
  }
  const parsed = SearchFilterSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid search type "${raw}". Expected one of: ${SearchFilterSchema.options.join(', ')}`,
    );
  }
  return parsed.data;
}

/** Validates the --limit option. */
function parseLimit(raw: string): number {
  const limit = Number.parseInt(raw, 10);
  if (Number.isNaN(limit) || limit < 1 || limit > 50) {
    throw new ValidationError(`Invalid limit "${raw}": expected a number between 1 and 50`);
  }
  return limit;
}
