import type { Logger } from 'pino';

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
} as const satisfies Record<string, Token<unknown>>;

/** Union of all registered token types. */
export type AppToken = (typeof Tokens)[keyof typeof Tokens];
