export { normalizeClientError } from '@/services/gateway/error-normalizer';
export { createInnertubeClient } from '@/services/gateway/innertube-factory';
export {
  type MusicClient,
  type MusicClientFactory,
  type MusicClientOptions,
} from '@/services/gateway/music-client';
export { parseLyricsText } from '@/services/gateway/mappers';
export {
  YouTubeMusicGateway,
  type YouTubeMusicGatewayOptions,
} from '@/services/gateway/youtube-music-gateway';
