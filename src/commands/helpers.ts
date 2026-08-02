import type { AppContext } from '@/cli/context';
import { pickTrack } from '@/cli/ui/pick';
import { withSpinner } from '@/cli/ui/spinner';
import { Tokens } from '@/core/tokens';
import type { Track } from '@/models';

/** Lazily builds the application context on first command execution. */
export type ContextFactory = () => Promise<AppContext>;

/** Result of {@link searchAndPickTrack}: the pick plus the full result set. */
export interface TrackSearchPick {
  readonly picked: Track;
  /** Every track from the search, including the pick (for queue seeding). */
  readonly results: readonly Track[];
}

/**
 * Searches songs and picks one interactively (first match on pipes).
 * Returns null when nothing matched.
 */
export async function searchAndPickTrack(
  context: AppContext,
  query: string,
): Promise<TrackSearchPick | null> {
  const searchService = context.container.resolve(Tokens.SearchService);
  const results = await withSpinner(`Searching for "${query}"…`, () =>
    searchService.search(query, 'songs', { limit: 10 }),
  );
  const picked = await pickTrack(results.tracks, { message: 'Pick a track' });
  if (picked === null) {
    return null;
  }
  return { picked, results: results.tracks };
}

/** Requires an authenticated session; throws AuthError when logged out. */
export async function requireAuth(context: AppContext): Promise<void> {
  await context.container.resolve(Tokens.AuthService).ensureAuthenticated();
}

/** Loads the persisted live queue into the QueueService. */
export function loadLiveQueue(context: AppContext): void {
  context.container.resolve(Tokens.QueueService).loadPersisted();
}

/** Parses a 1-based user-facing index into a 0-based one, or null. */
export function parseUserIndex(raw: string, length: number): number | null {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > length) {
    return null;
  }
  return parsed - 1;
}
