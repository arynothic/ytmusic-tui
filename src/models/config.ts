import { z } from 'zod';

/**
 * Application configuration. Every section is optional in the config file;
 * `.prefault({})` ensures missing sections are parsed through the schema
 * so all inner defaults are applied.
 */
export const AppConfigSchema = z.object({
  player: z
    .object({
      /** Preferred backend; "auto" detects mpv first, then vlc. */
      backend: z.enum(['auto', 'mpv', 'vlc']).default('auto'),
      volume: z.number().int().min(0).max(100).default(80),
      /** Explicit binary paths override PATH lookup. */
      mpvPath: z.string().optional(),
      vlcPath: z.string().optional(),
    })
    .prefault({}),
  cache: z
    .object({
      searchTtlSeconds: z.number().int().positive().default(300),
      metadataTtlSeconds: z.number().int().positive().default(86_400),
      /** Stream URLs expire after ~6h; cache below that horizon. */
      streamTtlSeconds: z.number().int().positive().default(18_000),
      maxEntries: z.number().int().positive().default(5000),
    })
    .prefault({}),
  download: z
    .object({
      /** Target directory; defaults to ~/Music/ytmusic when unset. */
      directory: z.string().optional(),
      audioFormat: z.enum(['bestaudio', 'mp3', 'flac', 'opus']).default('bestaudio'),
    })
    .prefault({}),
  search: z
    .object({
      limit: z.number().int().min(1).max(50).default(20),
    })
    .prefault({}),
  logging: z
    .object({
      level: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
      pretty: z.boolean().default(false),
    })
    .prefault({}),
  rateLimit: z
    .object({
      requestsPerSecond: z.number().positive().default(5),
    })
    .prefault({}),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

/** Player backend preference from the config. */
export type PlayerBackendPreference = AppConfig['player']['backend'];

/** Pino-compatible log level from the config. */
export type LogLevel = AppConfig['logging']['level'];

/** The default configuration with every default applied. */
export const DEFAULT_CONFIG: AppConfig = AppConfigSchema.parse({});
