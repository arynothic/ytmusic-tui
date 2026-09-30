import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Database } from '@/cache/sqlite';
import type { Logger } from 'pino';

import {
  createSecretStore,
  parseCookieHeader,
  serializeNetscapeCookieFile,
  SessionManager,
} from '@/auth';
import {
  ConfigService,
  ensureConfigDirectory,
  loadConfig,
  resolveAppPathsFromEnv,
  type AppPaths,
} from '@/config';
import { Container } from '@/core/container';
import { Tokens } from '@/core/tokens';
import type { AppConfig } from '@/models';
import { createPlayerBackend, LazyPlayerBackend } from '@/player';
import {
  openCacheDatabase,
  openHistoryDatabase,
  SqliteCacheStore,
  SqliteHistoryStore,
  SqliteQueueStore,
} from '@/repositories';
import { AuthService } from '@/services/auth';
import { DownloadService } from '@/services/download';
import { createInnertubeClient, YouTubeMusicGateway } from '@/services/gateway';
import { LibraryService } from '@/services/library';
import { LyricsService } from '@/services/lyrics';
import { PlaybackService } from '@/services/playback';
import { PlaylistService } from '@/services/playlists';
import { QueueService } from '@/services/queue';
import { SearchService } from '@/services/search';
import { YtDlpStreamResolver } from '@/services/stream';
import { createLogger } from '@/utils/logger';
import { TokenBucketRateLimiter } from '@/utils/rate-limiter';

/**
 * The composition root: every wired dependency a command needs.
 * Constructed lazily on first command execution.
 */
export interface AppContext {
  readonly container: Container;
  readonly paths: AppPaths;
  readonly config: AppConfig;
  readonly configService: ConfigService;
  readonly logger: Logger;
}

/**
 * Builds the application context: resolves paths, loads configuration,
 * creates the logger, and registers core services in the DI container.
 * Infrastructure adapters (gateway, player, stores) are registered
 * lazily by their own factories to keep CLI startup fast.
 */
export async function createAppContext(): Promise<AppContext> {
  const paths = resolveAppPathsFromEnv();
  await ensureConfigDirectory(paths);
  const { config } = await loadConfig({ paths });
  const logger = createLogger({
    level: config.logging.level,
    logFile: paths.logFile,
    pretty: config.logging.pretty,
  });
  const configService = new ConfigService(paths, config);

  const container = new Container();
  container.registerInstance(Tokens.AppConfig, config);
  container.registerInstance(Tokens.ConfigDirectory, paths.configDir);
  container.registerInstance(Tokens.Logger, logger);

  // Databases open lazily on first use; each file's stores share one
  // connection so migrations run exactly once per process.
  let cacheDb: Database | undefined;
  const getCacheDb = (): Database => (cacheDb ??= openCacheDatabase(paths.cacheDbFile));
  let historyDb: Database | undefined;
  const getHistoryDb = (): Database => (historyDb ??= openHistoryDatabase(paths.historyDbFile));

  container.register(Tokens.CacheStore, () => new SqliteCacheStore(getCacheDb()));
  container.register(Tokens.QueueStore, () => new SqliteQueueStore(getCacheDb()));
  container.register(Tokens.HistoryStore, () => new SqliteHistoryStore(getHistoryDb()));
  container.register(Tokens.SecretStore, () =>
    createSecretStore({ credentialsFile: paths.credentialsFile }),
  );
  container.register(
    Tokens.MusicGateway,
    () =>
      new YouTubeMusicGateway({
        factory: createInnertubeClient,
        rateLimiter: new TokenBucketRateLimiter({
          capacity: Math.max(1, Math.ceil(config.rateLimit.requestsPerSecond)),
          refillPerSecond: config.rateLimit.requestsPerSecond,
        }),
        logger,
      }),
  );
  container.register(Tokens.StreamResolver, (c) => {
    const sessionManager = c.resolve(Tokens.SessionManager);
    return new YtDlpStreamResolver({
      cacheStore: c.resolve(Tokens.CacheStore),
      streamTtlMs: config.cache.streamTtlSeconds * 1000,
      ...(config.youtube.cookiesFrom !== '' ? { cookiesFrom: config.youtube.cookiesFrom } : {}),
      // No browser configured: reuse a stored login, if any. No pasting.
      cookieProvider: async () => {
        const credentials = await sessionManager.loadCredentials().catch(() => undefined);
        return credentials === undefined
          ? undefined
          : serializeNetscapeCookieFile(parseCookieHeader(credentials.cookie));
      },
      logger,
    });
  });

  // The player backend is detected lazily so non-playback commands never
  // pay for (or fail on) mpv/VLC detection. The fixed IPC socket path is
  // what makes mpv act as the cross-process playback daemon.
  const mpvSocketPath =
    process.platform === 'win32'
      ? '\\\\.\\pipe\\ytmusic-cli-mpv'
      : join(paths.configDir, 'mpv.sock');
  container.register(
    Tokens.PlayerBackend,
    () =>
      new LazyPlayerBackend({
        volume: config.player.volume,
        factory: () =>
          createPlayerBackend({
            preference: config.player.backend,
            volume: config.player.volume,
            ...(config.player.mpvPath !== undefined ? { mpvPath: config.player.mpvPath } : {}),
            ...(config.player.vlcPath !== undefined ? { vlcPath: config.player.vlcPath } : {}),
            mpvSocketPath,
            logger,
          }),
      }),
  );

  container.register(
    Tokens.SessionManager,
    (c) =>
      new SessionManager(c.resolve(Tokens.SecretStore), c.resolve(Tokens.MusicGateway), logger),
  );
  container.register(
    Tokens.AuthService,
    (c) => new AuthService({ sessionManager: c.resolve(Tokens.SessionManager) }),
  );
  container.register(
    Tokens.QueueService,
    (c) => new QueueService({ queueStore: c.resolve(Tokens.QueueStore) }),
  );
  container.register(
    Tokens.SearchService,
    (c) =>
      new SearchService({
        gateway: c.resolve(Tokens.MusicGateway),
        cache: c.resolve(Tokens.CacheStore),
        searchTtlMs: config.cache.searchTtlSeconds * 1000,
        defaultLimit: config.search.limit,
      }),
  );
  container.register(
    Tokens.LibraryService,
    (c) =>
      new LibraryService({
        gateway: c.resolve(Tokens.MusicGateway),
        cache: c.resolve(Tokens.CacheStore),
        historyStore: c.resolve(Tokens.HistoryStore),
        metadataTtlMs: config.cache.metadataTtlSeconds * 1000,
        volatileTtlMs: config.cache.searchTtlSeconds * 1000,
      }),
  );
  container.register(
    Tokens.PlaylistService,
    (c) =>
      new PlaylistService({
        gateway: c.resolve(Tokens.MusicGateway),
        cache: c.resolve(Tokens.CacheStore),
      }),
  );
  container.register(
    Tokens.LyricsService,
    (c) =>
      new LyricsService({
        gateway: c.resolve(Tokens.MusicGateway),
        cache: c.resolve(Tokens.CacheStore),
        lyricsTtlMs: config.cache.metadataTtlSeconds * 1000,
      }),
  );
  container.register(
    Tokens.DownloadService,
    () =>
      new DownloadService({
        directory: config.download.directory ?? join(homedir(), 'Music', 'ytmusic'),
        audioFormat: config.download.audioFormat,
        logger,
      }),
  );
  container.register(
    Tokens.PlaybackService,
    (c) =>
      new PlaybackService({
        player: c.resolve(Tokens.PlayerBackend),
        streamResolver: c.resolve(Tokens.StreamResolver),
        queueService: c.resolve(Tokens.QueueService),
        historyStore: c.resolve(Tokens.HistoryStore),
        logger,
      }),
  );

  logger.debug({ configDir: paths.configDir }, 'application context initialized');
  return { container, paths, config, configService, logger };
}
