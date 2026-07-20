import type { Database } from 'better-sqlite3';
import type { Logger } from 'pino';

import { createSecretStore } from '@/auth';
import { ConfigService, ensureConfigDirectory, loadConfig, resolveAppPathsFromEnv, type AppPaths } from '@/config';
import { Container } from '@/core/container';
import { Tokens } from '@/core/tokens';
import type { AppConfig } from '@/models';
import {
  openCacheDatabase,
  openHistoryDatabase,
  SqliteCacheStore,
  SqliteHistoryStore,
  SqliteQueueStore,
} from '@/repositories';
import { createInnertubeClient, YouTubeMusicGateway } from '@/services/gateway';
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
    createSecretStore({ credentialsFile: paths.credentialsFile, logger }),
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
  container.register(
    Tokens.StreamResolver,
    (c) =>
      new YtDlpStreamResolver({
        cacheStore: c.resolve(Tokens.CacheStore),
        streamTtlMs: config.cache.streamTtlSeconds * 1000,
        logger,
      }),
  );

  logger.debug({ configDir: paths.configDir }, 'application context initialized');
  return { container, paths, config, configService, logger };
}
