import type { ResolvedStream, VideoId } from '@/models';

/** Port that produces playable audio URLs for tracks. */
export interface StreamResolver {
  /**
   * Resolves a playable stream URL for a track.
   * Throws {@link StreamError} when resolution is impossible.
   */
  resolve(trackId: VideoId): Promise<ResolvedStream>;
}
