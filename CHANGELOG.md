# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-08-03

Initial release.

### Added

- **Search** across songs, videos, albums, artists, playlists and podcasts
  with filters, per-category limits, paginated continuation, and result
  caching.
- **Playback** via mpv (JSON IPC, preferred) or VLC (RC interface, fallback):
  play, pause, resume, stop, next, previous, seek and volume. mpv runs as a
  detached background process with a fixed IPC socket, so every CLI
  invocation controls the same player across terminals.
- **Queue** with shuffle, repeat (off/all/one), reorder, removal, jump-to-item,
  and named save/restore — persisted in SQLite and shared across invocations.
- **Library**: liked songs, local and remote history, albums, artists,
  playlists, with TTL caching.
- **Playlists**: list, show, create, rename, delete, add and remove tracks by
  id or exact title.
- **Lyrics**: plain and synced (LRC timestamps) with negative-result caching.
- **Downloads** via yt-dlp with embedded metadata and album artwork.
- **Full-screen TUI** (`ytmusic tui`) built with Ink: now-playing panel with
  progress bar, scrollable queue, live search, complete keybindings.
- **Authentication**: browser cookie import (header or Netscape file),
  OS keychain storage via keytar with an atomic 0600 file fallback, and
  session validation on login.
- **Configuration** in `~/.config/ytmusic-cli` with `ytmusic config`
  list/get/set/path and `YTMUSIC_*` environment overrides.
- **Engineering**: strict TypeScript (no `any`), Clean Architecture with a
  typed DI container, zod validation at every boundary, custom error taxonomy
  with documented exit codes, token-bucket rate limiting, retries with
  jittered backoff, EPIPE-safe output, 490+ tests with ≥90% line coverage,
  CI, Dependabot, Renovate, Husky and lint-staged.

[0.1.0]: https://github.com/arynothic/ytb-cli/releases/tag/v0.1.0
