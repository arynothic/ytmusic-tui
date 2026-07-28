import { describe, expect, it, vi } from 'vitest';

import { PlayerError } from '@/core/errors';
import { MpvPlayerBackend } from '@/player/mpv-backend';
import { createPlayerBackend } from '@/player/player-factory';
import { VlcPlayerBackend } from '@/player/vlc-backend';

/** Builds a findExec fake from a name→path map (missing names = not found). */
function fakeFindExec(paths: Record<string, string>) {
  return vi.fn(async (name: string) => paths[name]);
}

describe('createPlayerBackend', () => {
  it('prefers mpv in auto mode when both players exist', async () => {
    const backend = await createPlayerBackend({
      preference: 'auto',
      volume: 80,
      findExec: fakeFindExec({ mpv: '/usr/bin/mpv', vlc: '/usr/bin/vlc' }),
    });
    expect(backend).toBeInstanceOf(MpvPlayerBackend);
    expect(backend.name).toBe('mpv');
  });

  it('falls back to VLC in auto mode when mpv is missing', async () => {
    const backend = await createPlayerBackend({
      preference: 'auto',
      volume: 80,
      findExec: fakeFindExec({ vlc: '/usr/bin/vlc' }),
    });
    expect(backend).toBeInstanceOf(VlcPlayerBackend);
    expect(backend.name).toBe('vlc');
  });

  it('raises PLAYER_NOT_FOUND in auto mode when nothing exists', async () => {
    await expect(
      createPlayerBackend({ preference: 'auto', volume: 80, findExec: fakeFindExec({}) }),
    ).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND' });
  });

  it('raises PLAYER_NOT_FOUND when the explicit preference is missing', async () => {
    await expect(
      createPlayerBackend({
        preference: 'mpv',
        volume: 80,
        findExec: fakeFindExec({ vlc: '/usr/bin/vlc' }),
      }),
    ).rejects.toBeInstanceOf(PlayerError);

    const backend = await createPlayerBackend({
      preference: 'vlc',
      volume: 80,
      findExec: fakeFindExec({ vlc: '/usr/bin/vlc' }),
    });
    expect(backend.name).toBe('vlc');
  });

  it('honors explicit binary paths without touching PATH', async () => {
    const findExec = fakeFindExec({});
    const backend = await createPlayerBackend({
      preference: 'mpv',
      volume: 65,
      mpvPath: '/opt/mpv/bin/mpv',
      findExec,
    });
    expect(backend.name).toBe('mpv');
    expect(findExec).not.toHaveBeenCalled();
    expect((await backend.getSnapshot()).volume).toBe(65);
  });

  it('reports full capabilities for both backends', async () => {
    const mpv = await createPlayerBackend({
      preference: 'mpv',
      volume: 80,
      findExec: fakeFindExec({ mpv: '/usr/bin/mpv' }),
    });
    expect(mpv.capabilities).toEqual({ canSeek: true, canSetVolume: true, reportsPosition: true });

    const vlc = await createPlayerBackend({
      preference: 'vlc',
      volume: 80,
      findExec: fakeFindExec({ vlc: '/usr/bin/vlc' }),
    });
    expect(vlc.capabilities.reportsPosition).toBe(true);
  });
});
