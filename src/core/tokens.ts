import type { Logger } from 'pino';

import type { SessionManager } from '@/auth';
import { createToken, type Token } from '@/core/container';
import type {
  CacheStore,
  HistoryStore,
  MusicGateway,
  PlayerBackend,
  QueueStore,
  SecretStore,
  StreamResolver,
} from '@/core/ports';
import type { AppConfig } from '@/models';
import type { AuthService } from '@/services/auth';
import type { DownloadService } from '@/services/download';
import type { LibraryService } from '@/services/library';
import type { LyricsService } from '@/services/lyrics';
import type { PlaybackService } from '@/services/playback';
import type { PlaylistService } from '@/services/playlists';
import type { QueueService } from '@/services/queue';
import type { SearchService } from '@/services/search';

/** Central registry of injection tokens used by the composition root. */
export const Tokens = {
  AppConfig: createToken<AppConfig>('AppConfig'),
  Logger: createToken<Logger>('Logger'),
  ConfigDirectory: createToken<string>('ConfigDirectory'),
  MusicGateway: createToken<MusicGateway>('MusicGateway'),
  StreamResolver: createToken<StreamResolver>('StreamResolver'),
  PlayerBackend: createToken<PlayerBackend>('PlayerBackend'),
  SecretStore: createToken<SecretStore>('SecretStore'),
  CacheStore: createToken<CacheStore>('CacheStore'),
  HistoryStore: createToken<HistoryStore>('HistoryStore'),
  QueueStore: createToken<QueueStore>('QueueStore'),
  SessionManager: createToken<SessionManager>('SessionManager'),
  AuthService: createToken<AuthService>('AuthService'),
  SearchService: createToken<SearchService>('SearchService'),
  PlaybackService: createToken<PlaybackService>('PlaybackService'),
  QueueService: createToken<QueueService>('QueueService'),
  LibraryService: createToken<LibraryService>('LibraryService'),
  PlaylistService: createToken<PlaylistService>('PlaylistService'),
  LyricsService: createToken<LyricsService>('LyricsService'),
  DownloadService: createToken<DownloadService>('DownloadService'),
} as const satisfies Record<string, Token<unknown>>;

/** Union of all registered token types. */
export type AppToken = (typeof Tokens)[keyof typeof Tokens];
