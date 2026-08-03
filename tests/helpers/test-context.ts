import { vi } from 'vitest';

import { SessionManager } from '@/auth';
import type { AppContext } from '@/cli/context';
import { ConfigService, loadConfig, resolveAppPaths, type EnvReader } from '@/config';
import { Container } from '@/core/container';
import type { SecretStore } from '@/core/ports';
import { Tokens } from '@/core/tokens';
import type { ResolvedStream, VideoId } from '@/models';
import { AuthService } from '@/services/auth';
import { DownloadService } from '@/services/download';
import { LibraryService } from '@/services/library';
import { LyricsService } from '@/services/lyrics';
import { PlaybackService } from '@/services/playback';
import { PlaylistService } from '@/services/playlists';
import { QueueService } from '@/services/queue';
import { SearchService } from '@/services/search';
import { createLogger } from '@/utils/logger';

import { MockCacheStore } from '../mocks/mock-cache-store';
import { MockHistoryStore } from '../mocks/mock-history-store';
import { MockMusicGateway, type MockGatewayData } from '../mocks/mock-music-gateway';
import { MockPlayerBackend } from '../mocks/mock-player-backend';
import { MockQueueStore } from '../mocks/mock-queue-store';

/** EnvReader that sees nothing — keeps host env out of tests. */
export const nullEnvReader: EnvReader = {
  get: () => undefined,
  getBoolean: () => undefined,
  getInteger: () => undefined,
};

/** Builds a real AppContext rooted at a temporary config directory. */
export async function createTestContext(configDir: string): Promise<AppContext> {
  const paths = resolveAppPaths({ configHomeOverride: configDir });
  const { config } = await loadConfig({ paths, homeDir: configDir, envReader: nullEnvReader });
  const configService = new ConfigService(paths, config);
  return {
    container: new Container(),
    paths,
    config,
    configService,
    logger: createLogger({ level: 'silent' }),
  };
}

/** A test context whose container is fully wired with test doubles. */
export interface ServiceTestContext {
  readonly context: AppContext;
  readonly gateway: MockMusicGateway;
  readonly player: MockPlayerBackend;
  readonly cacheStore: MockCacheStore;
  readonly queueStore: MockQueueStore;
  readonly historyStore: MockHistoryStore;
  readonly secretStore: SecretStore & { data: Map<string, string> };
  readonly downloadRun: { calls: { command: string; args: readonly string[] }[] };
}

/** In-memory SecretStore double. */
function createMemorySecretStore(): SecretStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    name: 'memory',
    data,
    isAvailable: () => Promise.resolve(true),
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

/**
 * Builds an AppContext with every port backed by in-memory test doubles
 * and all application services wired like the real composition root.
 */
export async function createServiceTestContext(
  configDir: string,
  gatewayData: MockGatewayData = {},
): Promise<ServiceTestContext> {
  const context = await createTestContext(configDir);
  const gateway = new MockMusicGateway(gatewayData);
  const player = new MockPlayerBackend();
  const cacheStore = new MockCacheStore();
  const queueStore = new MockQueueStore();
  const historyStore = new MockHistoryStore();
  const secretStore = createMemorySecretStore();
  const downloadRun = { calls: [] as { command: string; args: readonly string[] }[] };

  const { container } = context;
  container.registerInstance(Tokens.MusicGateway, gateway);
  container.registerInstance(Tokens.PlayerBackend, player);
  container.registerInstance(Tokens.CacheStore, cacheStore);
  container.registerInstance(Tokens.QueueStore, queueStore);
  container.registerInstance(Tokens.HistoryStore, historyStore);
  container.registerInstance(Tokens.SecretStore, secretStore);
  container.registerInstance(Tokens.StreamResolver, {
    resolve: (trackId: VideoId): Promise<ResolvedStream> =>
      Promise.resolve({
        trackId,
        url: `https://streams.example.com/${trackId}`,
        expiresAt: Date.now() + 3_600_000,
      }),
  });
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
        searchTtlMs: 60_000,
        defaultLimit: 20,
      }),
  );
  container.register(
    Tokens.LibraryService,
    (c) =>
      new LibraryService({
        gateway: c.resolve(Tokens.MusicGateway),
        cache: c.resolve(Tokens.CacheStore),
        historyStore: c.resolve(Tokens.HistoryStore),
        metadataTtlMs: 60_000,
        volatileTtlMs: 60_000,
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
        lyricsTtlMs: 60_000,
      }),
  );
  container.register(
    Tokens.SessionManager,
    (c) => new SessionManager(c.resolve(Tokens.SecretStore), c.resolve(Tokens.MusicGateway)),
  );
  container.register(
    Tokens.AuthService,
    (c) => new AuthService({ sessionManager: c.resolve(Tokens.SessionManager) }),
  );
  container.register(
    Tokens.DownloadService,
    () =>
      new DownloadService({
        directory: `${configDir}/downloads`,
        audioFormat: 'bestaudio',
        run: (command, args = [], options = {}) => {
          downloadRun.calls.push({ command, args });
          const outputIndex = args.indexOf('-o');
          const template =
            outputIndex === -1 ? '/tmp/out.webm' : (args[outputIndex + 1] ?? '/tmp/out.webm');
          const filePath = template.replace('%(ext)s', 'webm');
          options.onStdoutLine?.(filePath);
          return Promise.resolve({ code: 0, stdout: '', stderr: '', killed: false });
        },
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
      }),
  );

  return {
    context,
    gateway,
    player,
    cacheStore,
    queueStore,
    historyStore,
    secretStore,
    downloadRun,
  };
}

/** Captures process.stdout writes until `restore()` is called. */
export function captureStdout(): { text: () => string; restore: () => void } {
  let output = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
    output += String(chunk);
    return true;
  });
  return {
    text: () => output,
    restore: () => {
      spy.mockRestore();
    },
  };
}

/** Captures process.stderr writes until `restore()` is called. */
export function captureStderr(): { text: () => string; restore: () => void } {
  let output = '';
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown): boolean => {
    output += String(chunk);
    return true;
  });
  return {
    text: () => output,
    restore: () => {
      spy.mockRestore();
    },
  };
}
