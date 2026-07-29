export { LazyPlayerBackend } from '@/player/lazy-player-backend';
export { MpvPlayerBackend, type MpvPlayerBackendOptions } from '@/player/mpv-backend';
export { connectMpvIpc, type MpvIpcAddress, type MpvIpcConnection } from '@/player/mpv-ipc';
export { createPlayerBackend, type CreatePlayerBackendOptions } from '@/player/player-factory';
export { VlcPlayerBackend, type VlcPlayerBackendOptions } from '@/player/vlc-backend';
export { connectVlcRc, type VlcRcConnection } from '@/player/vlc-rc';
