import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppContext } from '@/cli/context';
import { Tokens } from '@/core/tokens';

import { createTempDir, removeTempDir } from '../helpers/temp-dir';

describe('createAppContext (composition root)', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDir();
    vi.stubEnv('YTMUSIC_CONFIG_HOME', directory);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await removeTempDir(directory);
  });

  it('builds the context and resolves every registered token', async () => {
    const { container, paths, config, configService } = await createAppContext();

    expect(paths.configDir).toBe(directory);
    expect(config.player.backend).toBe('auto');
    expect(configService).toBeDefined();

    // Every token resolves without throwing.
    expect(container.resolve(Tokens.CacheStore)).toBeDefined();
    expect(container.resolve(Tokens.QueueStore)).toBeDefined();
    expect(container.resolve(Tokens.HistoryStore)).toBeDefined();
    expect(container.resolve(Tokens.SecretStore)).toBeDefined();
    expect(container.resolve(Tokens.MusicGateway)).toBeDefined();
    expect(container.resolve(Tokens.StreamResolver)).toBeDefined();
    expect(container.resolve(Tokens.PlayerBackend)).toBeDefined();
    expect(container.resolve(Tokens.SessionManager)).toBeDefined();
    expect(container.resolve(Tokens.AuthService)).toBeDefined();
    expect(container.resolve(Tokens.QueueService)).toBeDefined();
    expect(container.resolve(Tokens.SearchService)).toBeDefined();
    expect(container.resolve(Tokens.LibraryService)).toBeDefined();
    expect(container.resolve(Tokens.PlaylistService)).toBeDefined();
    expect(container.resolve(Tokens.LyricsService)).toBeDefined();
    expect(container.resolve(Tokens.DownloadService)).toBeDefined();
    expect(container.resolve(Tokens.PlaybackService)).toBeDefined();

    // Singletons memoize.
    expect(container.resolve(Tokens.QueueService)).toBe(container.resolve(Tokens.QueueService));
  });

  it('reports an idle snapshot before any player detection ran', async () => {
    const { container } = await createAppContext();
    const player = container.resolve(Tokens.PlayerBackend);
    const snapshot = await player.getSnapshot();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.volume).toBe(80);
  });
});
