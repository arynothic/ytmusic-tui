/**
 * Narrow structural view of the youtubei.js client surface the gateway
 * actually uses. The vendor classes carry private members (nominal
 * typing), so the real Innertube instance is cast to this interface once,
 * inside the factory — everywhere else depends on this clean shape.
 * All payloads are `unknown` and validated with loose zod schemas in the
 * mapper layer, making the adapter resilient to vendor version drift.
 */
export interface MusicClient {
  readonly music: {
    search(query: string, filters?: { type?: string }): Promise<unknown>;
    getInfo(videoId: string): Promise<unknown>;
    getAlbum(albumId: string): Promise<unknown>;
    getArtist(artistId: string): Promise<unknown>;
    getPlaylist(playlistId: string): Promise<unknown>;
    getLibrary(): Promise<unknown>;
    getLyrics(videoId: string): Promise<unknown>;
  };
  readonly playlist: {
    create(title: string, videoIds: string[]): Promise<unknown>;
    delete(playlistId: string): Promise<unknown>;
    addVideos(playlistId: string, videoIds: string[]): Promise<unknown>;
    removeVideos(
      playlistId: string,
      videoIds: string[],
      useSetVideoIds?: boolean,
    ): Promise<unknown>;
    setName(playlistId: string, name: string): Promise<unknown>;
  };
  readonly account?: {
    getInfo?(): Promise<unknown>;
  };
  getHistory(): Promise<unknown>;
}

/** Options for creating a client; mirrors the SessionOptions subset used. */
export interface MusicClientOptions {
  readonly cookie?: string;
  readonly visitorData?: string;
}

/** Factory creating a MusicClient; injectable for tests. */
export type MusicClientFactory = (options: MusicClientOptions) => Promise<MusicClient>;
