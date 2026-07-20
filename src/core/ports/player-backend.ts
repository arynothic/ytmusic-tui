import type { Track } from '@/models';

/** Playback status reported by a player backend. */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped';

/** Point-in-time view of a player backend. */
export interface PlayerSnapshot {
  readonly status: PlayerStatus;
  readonly track: Track | null;
  readonly positionSeconds: number;
  /** Volume 0-100. */
  readonly volume: number;
}

/** Everything a backend needs to start playback of a track. */
export interface PlayRequest {
  readonly track: Track;
  readonly streamUrl: string;
  readonly startPositionSeconds?: number;
}

/** Optional capabilities a backend may or may not support. */
export interface PlayerCapabilities {
  readonly canSeek: boolean;
  readonly canSetVolume: boolean;
  readonly reportsPosition: boolean;
}

/** Listener for player state changes; returns nothing. */
export type PlayerStateListener = (snapshot: PlayerSnapshot) => void;

/**
 * Port to an audio player process (mpv, vlc, ...). Implementations manage
 * an external child process and translate its events into snapshots.
 */
export interface PlayerBackend {
  readonly name: string;
  readonly capabilities: PlayerCapabilities;

  /** Starts playback of the given stream. */
  play(request: PlayRequest): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Stops playback and clears the current track. */
  stop(): Promise<void>;
  /** Seeks to an absolute position in seconds. */
  seekTo(positionSeconds: number): Promise<void>;
  /** Sets volume 0-100. */
  setVolume(volume: number): Promise<void>;

  /** Current state of the backend. */
  getSnapshot(): Promise<PlayerSnapshot>;

  /** Subscribes to state changes; returns an unsubscribe function. */
  onStateChange(listener: PlayerStateListener): () => void;

  /** Terminates the underlying process and releases resources. */
  dispose(): Promise<void>;
}
