import { useEffect, useState } from 'react';

import type { NowPlaying, PlaybackService } from '@/services/playback';

/**
 * Polls PlaybackService.now() on an interval so the TUI tracks the
 * player (position progress, volume, status) without any event wiring.
 */
export function usePlayerState(playback: PlaybackService, tickMs = 500): NowPlaying | null {
  const [now, setNow] = useState<NowPlaying | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = (): void => {
      void playback.now().then((state) => {
        if (!cancelled) {
          setNow(state);
        }
      });
    };
    refresh();
    const timer = setInterval(refresh, tickMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [playback, tickMs]);

  return now;
}
