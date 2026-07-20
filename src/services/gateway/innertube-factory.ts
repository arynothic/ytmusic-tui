import { Innertube } from 'youtubei.js';

import type { MusicClientFactory } from '@/services/gateway/music-client';

/**
 * Creates a MusicClient backed by a real youtubei.js Innertube session.
 * `retrieve_player` is disabled (stream resolution is delegated to
 * yt-dlp, so no JS player deciphering is needed) which keeps session
 * creation fast. The Innertube instance structurally satisfies the
 * narrow MusicClient interface.
 */
export const createInnertubeClient: MusicClientFactory = async (options) => {
  const innertube = await Innertube.create({
    cookie: options.cookie,
    visitor_data: options.visitorData,
    retrieve_player: false,
    enable_session_cache: false,
  });
  return innertube;
};
