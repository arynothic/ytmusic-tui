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

/** Structural view of music list items (songs, albums, artists, ...). */
export const ListItemSchema = z.object({
  id: z.string().optional(),
  title: z.unknown().optional(),
  item_type: z.string().optional(),
  duration: z
    .object({ text: z.string().optional(), seconds: z.number().optional() })
    .optional(),
  album: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
  artists: z
    .array(z.object({ name: z.string().optional(), channel_id: z.string().optional() }))
    .optional(),
  authors: z
    .array(z.object({ name: z.string().optional(), channel_id: z.string().optional() }))
    .optional(),
  author: z.object({ name: z.string().optional(), channel_id: z.string().optional() }).optional(),
  year: z.string().optional(),
  subscribers: z.string().optional(),
  item_count: z.string().optional(),
  song_count: z.string().optional(),
  subtitle: z.unknown().optional(),
  set_video_id: z.string().optional(),
  badges: z.array(z.object({ label: z.string().optional() })).optional(),
  thumbnails: z.unknown().optional(),
  endpoint: z
    .object({
      payload: z
        .object({ videoId: z.string().optional(), browseId: z.string().optional() })
        .optional(),
    })
    .optional(),
});
export type ListItem = z.infer<typeof ListItemSchema>;

/** Parses a vendor list item node; undefined when it has an alien shape. */
export function parseListItem(node: unknown): ListItem | undefined {
  const parsed = ListItemSchema.safeParse(node);
  return parsed.success ? parsed.data : undefined;
}

/** Structural view of detail-page headers. */
export const HeaderSchema = z.object({
  title: z.unknown().optional(),
  description: z.unknown().optional(),
  subtitle: z.unknown().optional(),
  second_subtitle: z.unknown().optional(),
  subscribers: z.unknown().optional(),
  thumbnails: z.unknown().optional(),
});
export type Header = z.infer<typeof HeaderSchema>;

/** Structural view of a shelf containing items (MusicShelf/Grid/...). */
export const ShelfSchema = z.object({
  title: z.unknown().optional(),
  header: z.object({ title: z.unknown().optional() }).optional(),
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

/**
 * Recursively collects list-item-looking nodes out of the nested
 * shelf/section structures YouTube Music returns (search pages, library,
 * history). Depth-limited to stay safe on unexpected shapes.
 */
export function collectListItems(node: unknown, depth = 0): unknown[] {
  if (depth > 4 || node === null || typeof node !== 'object') {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectListItems(child, depth + 1));
  }
  const asShelf = ShelfSchema.safeParse(node);
  if (asShelf.success && (asShelf.data.contents !== undefined || asShelf.data.items !== undefined)) {
    return collectListItems(readShelfItems(asShelf.data), depth + 1);
  }
  const asItem = ListItemSchema.safeParse(node);
  if (
    asItem.success &&
    (asItem.data.id !== undefined ||
      asItem.data.item_type !== undefined ||
      asItem.data.endpoint?.payload !== undefined)
  ) {
    return [node];
  }
  return [];
}
