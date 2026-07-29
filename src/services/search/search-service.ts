import type { CacheStore, MusicGateway, SearchOptions } from '@/core/ports';
import { SearchResultsSchema, type SearchFilter, type SearchResults } from '@/models';

/** Options for {@link SearchService}. */
export interface SearchServiceOptions {
  readonly gateway: MusicGateway;
  readonly cache: CacheStore;
  /** Cache TTL for search result pages in milliseconds. */
  readonly searchTtlMs: number;
  /** Fallback result limit when the caller passes none. */
  readonly defaultLimit: number;
}

/**
 * Application-facing search: normalizes queries, applies the configured
 * default limit, and caches result pages so repeated searches stay fast.
 * Paginated streaming (`searchPages`) intentionally bypasses the cache.
 */
export class SearchService {
  readonly #gateway: MusicGateway;
  readonly #cache: CacheStore;
  readonly #searchTtlMs: number;
  readonly #defaultLimit: number;

  constructor(options: SearchServiceOptions) {
    this.#gateway = options.gateway;
    this.#cache = options.cache;
    this.#searchTtlMs = options.searchTtlMs;
    this.#defaultLimit = options.defaultLimit;
  }

  /** Runs a cached single-page search. */
  async search(
    query: string,
    filter: SearchFilter | null,
    options: SearchOptions = {},
  ): Promise<SearchResults> {
    const trimmed = query.trim();
    const limit = options.limit ?? this.#defaultLimit;
    const cacheKey = `search:${filter ?? 'all'}:${trimmed.toLowerCase()}:${String(limit)}`;
    if (options.continuation === undefined || options.continuation === null) {
      const cached = this.#cache.get(cacheKey, SearchResultsSchema);
      if (cached !== undefined) {
        return cached;
      }
    }
    const results = await this.#gateway.search(trimmed, filter, { ...options, limit });
    this.#cache.set(cacheKey, results, this.#searchTtlMs);
    return results;
  }

  /** Streams successive search pages (never cached). */
  searchPages(query: string, filter: SearchFilter | null): AsyncIterable<SearchResults> {
    return this.#gateway.searchPages(query.trim(), filter);
  }
}
