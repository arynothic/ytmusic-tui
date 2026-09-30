import { z } from 'zod';

/**
 * Loose zod schemas describing only the vendor payload properties the
 * mappers read. Unknown keys are stripped, and any mismatch results in a
 * dropped item rather than a crashed command — the YouTube Music web
 * client changes shape frequently, so the boundary is deliberately
 * forgiving. Domain invariants are enforced separately by the strict
 * schemas in models/ before anything reaches the app.
 */

/** Vendor "Text" node: { text } or { runs: [{ text }] }. */
const TextLikeSchema = z.object({
  text: z.string().optional(),
  runs: z.array(z.object({ text: z.string().optional() })).optional(),
});

/**
 * Reads a vendor Text node (or plain string) into a string.
 * Returns undefined for missing/empty values.
 */
export function readText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value === '' ? undefined : value;
  }
  const parsed = TextLikeSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  if (parsed.data.text !== undefined && parsed.data.text !== '') {
    return parsed.data.text;
  }
  if (parsed.data.runs !== undefined) {
    const joined = parsed.data.runs.map((run) => run.text ?? '').join('');
    return joined === '' ? undefined : joined;
  }
  return undefined;
}

const ThumbnailSchema = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/** Picks the largest thumbnail URL from a vendor thumbnails array. */
export function pickThumbnailUrl(thumbnails: unknown): string | undefined {
  const parsed = z.array(ThumbnailSchema).safeParse(thumbnails);
  if (!parsed.success || parsed.data.length === 0) {
    return undefined;
  }
  return parsed.data[parsed.data.length - 1]?.url;
}

/**
 * Wraps a schema so a null, a wrong type, or a missing value degrades to
 * undefined instead of invalidating the whole object. This is what makes
 * the list-item schema "loose": one unexpected property never drops an item.
 */
function loose<S extends z.ZodTypeAny>(schema: S): z.ZodType<z.infer<S> | undefined> {
  return schema
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined);
}

const looseString = loose(z.string());
const looseNumber = loose(z.number());
const nameRef = loose(z.object({ name: looseString, channel_id: looseString }));

/** Structural view of music list items (songs, albums, artists, ...). */
export const ListItemSchema = z.object({
  id: looseString,
  title: z.unknown().optional(),
  item_type: looseString,
  duration: loose(z.object({ text: z.string().optional(), seconds: looseNumber })),
  album: loose(z.object({ id: looseString, name: looseString })),
  artists: loose(z.array(nameRef)),
  authors: loose(z.array(nameRef)),
  author: nameRef,
  year: looseString,
  subscribers: looseString,
  item_count: looseString,
  song_count: looseString,
  subtitle: z.unknown().optional(),
  set_video_id: looseString,
  badges: loose(z.array(z.object({ label: looseString }))),
  thumbnails: z.unknown().optional(),
  flex_columns: loose(
    z.array(z.object({ title: z.unknown().optional(), subtitle: z.unknown().optional() })),
  ),
  endpoint: loose(
    z.object({
      payload: loose(z.object({ videoId: looseString, browseId: looseString })),
    }),
  ),
});
export type ListItem = z.infer<typeof ListItemSchema>;

/** Parses a vendor list item node; undefined when it has an alien shape. */
export function parseListItem(node: unknown): ListItem | undefined {
  const parsed = ListItemSchema.safeParse(node);
  return parsed.success ? parsed.data : undefined;
}

/** Reads an item's primary title (top-level, or first flex column). */
export function readItemTitle(item: ListItem): string | undefined {
  return readText(item.title) ?? readText(item.flex_columns?.[0]?.title);
}

/** Reads an item's secondary subtitle (top-level, or second flex column). */
export function readItemSubtitle(item: ListItem): string | undefined {
  return readText(item.subtitle) ?? readText(item.flex_columns?.[1]?.title);
}

/** Structural view of detail-page headers. */
export const HeaderSchema = z.object({
  title: z.unknown().optional(),
  description: z.unknown().optional(),
  subtitle: z.unknown().optional(),
  second_subtitle: z.unknown().optional(),
  strapline_text_one: z.unknown().optional(),
  subscribers: z.unknown().optional(),
  thumbnails: z.unknown().optional(),
});
export type Header = z.infer<typeof HeaderSchema>;

/**
 * Structural view of a shelf/section containing items
 * (MusicShelf, MusicCarouselShelf, ItemSection, ...). Headers are
 * commonly `null` depending on the shelf variant, so they are nullable.
 */
export const ShelfSchema = z.object({
  title: z.unknown().optional(),
  header: z.object({ title: z.unknown().optional() }).nullish(),
  contents: z.array(z.unknown()).optional(),
  items: z.array(z.unknown()).optional(),
});
export type Shelf = z.infer<typeof ShelfSchema>;

/** Reads a shelf's display title. */
export function readShelfTitle(shelf: Shelf): string | undefined {
  return readText(shelf.header?.title) ?? readText(shelf.title);
}

/** Reads a shelf's item list regardless of the container variant. */
export function readShelfItems(shelf: Shelf): unknown[] {
  return shelf.contents ?? shelf.items ?? [];
}

/** Container keys that recursively hold nested shelves/items. */
const CONTAINER_KEYS = ['contents', 'items', 'sections'] as const;

/** Maximum nesting depth the collector will descend into. */
const MAX_COLLECT_DEPTH = 8;

/**
 * True when a node looks like a vendor list item (a song, album, artist,
 * playlist, ...) rather than a shelf/section. Detection is structural and
 * deliberately independent of zod so a single unexpected property on an
 * unrelated field cannot cause the whole item to be dropped.
 */
function looksLikeListItem(record: Record<string, unknown>): boolean {
  const payload = (record['endpoint'] as { payload?: unknown } | undefined)?.payload;
  const payloadId =
    payload !== null && typeof payload === 'object'
      ? ((payload as Record<string, unknown>)['videoId'] ??
        (payload as Record<string, unknown>)['browseId'])
      : undefined;
  const hasId =
    (typeof record['id'] === 'string' && record['id'] !== '') ||
    (typeof payloadId === 'string' && payloadId !== '');
  const hasShape = record['item_type'] !== undefined || record['title'] !== undefined;
  const isContainer = CONTAINER_KEYS.some((key) => Array.isArray(record[key]));
  return hasId && hasShape && !isContainer;
}

/**
 * Recursively collects list items out of the nested shelf/section
 * structures YouTube Music returns (search pages, library, history).
 * Descends through any `contents`/`items`/`sections` array without
 * assuming a particular container shape, and is depth- and count-bounded
 * so a pathological payload cannot blow the stack.
 */
export function collectListItems(node: unknown, depth = 0): unknown[] {
  if (depth > MAX_COLLECT_DEPTH || node === null || typeof node !== 'object') {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectListItems(child, depth + 1));
  }
  const record = node as Record<string, unknown>;
  if (looksLikeListItem(record)) {
    return [node];
  }
  const results: unknown[] = [];
  for (const key of CONTAINER_KEYS) {
    const child = record[key];
    if (Array.isArray(child)) {
      results.push(...collectListItems(child, depth + 1));
    }
  }
  return results;
}
