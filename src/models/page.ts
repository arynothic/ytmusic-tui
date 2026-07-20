/** A single page of a paginated result set. */
export interface Page<T> {
  readonly items: T[];
  /** Opaque token for the next page; null when no more pages exist. */
  readonly continuation: string | null;
}
