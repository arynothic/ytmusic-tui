# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-10-01

### Changed

- **No native dependencies.** The SQLite layer now uses Node's built-in
  `node:sqlite` instead of `better-sqlite3`, and the deprecated `keytar`
  OS-keychain backend was removed in favour of the existing `0600`
  credentials file. `npm install -g ytmusic-tui` therefore needs no
  compiler and no install-script approvals — which matters now that npm
  blocks dependency install scripts by default. The published package has
  no install scripts at all.

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
  and named save/restore — persisted and shared across invocations.
- **Library**: liked songs, local and remote history, albums, artists,
  playlists, with TTL caching.
- **Playlists**: list, show, create, rename, delete, add and remove tracks by
  id or exact title.
- **Lyrics**: plain and synced (LRC timestamps) with negative-result caching.
- **Downloads** via yt-dlp with embedded metadata and album artwork.
- **Full-screen TUI** (`ytmusic tui`) built with Ink: now-playing panel with
  progress bar, scrollable queue, live search, complete keybindings.
- **Authentication**: browser cookie import (header or Netscape file) with
  session validation on login.
- **Configuration** in `~/.config/ytmusic-cli` with `ytmusic config`
  list/get/set/path and `YTMUSIC_*` environment overrides.
- **Engineering**: strict TypeScript (no `any`), Clean Architecture with a
  typed DI container, zod validation at every boundary, custom error taxonomy
  with documented exit codes, token-bucket rate limiting, retries with
  jittered backoff, EPIPE-safe output, 490+ tests with ≥90% line coverage,
  CI, Dependabot, Renovate, Husky and lint-staged.

### Fixed

- **Default searches returned no results.** The vendor list-item schema
  rejected items whose optional fields (`header`, `badges`, …) were `null`,
  and the recursive collector never descended through the flattened
  `ItemSection` shape that YouTube Music returns for an unfiltered search.
  The schema is now genuinely forgiving and the collector is structural.
- **Playback control from a second terminal failed.** `pause`, `resume`,
  `seek`, `volume` and `now` did not reconnect to the resident mpv; only
  `play` did. All control/read commands now attach to the existing IPC
  socket without spawning a new player, and `now` reports the live state.
- **The queue skipped a track on every `play`.** mpv emits observed
  `volume`/`time-pos` property events before playback begins, carrying the
  initial `idle` snapshot; this was mistaken for "track ended" and
  auto-advanced the queue. Only a real `playing`/`paused → idle`
  transition now advances.
- **Album artist metadata was missing** ("Unknown artist"): the artist is
  read from the header strapline and propagated to album tracks.
- **Artist search returned nothing** because names live in `flex_columns`.
- **The TUI could not search for queries containing `q` or `a`** (`q` quit
  and `a` enqueued while typing). Search input is now fully literal, with
  `Tab` to enqueue and `Esc` to go back, plus inline error reporting and a
  terminal-height-aware layout.

[0.1.1]: https://github.com/arynothic/ytmusic-cli/releases/tag/v0.1.1
[0.1.0]: https://github.com/arynothic/ytmusic-cli/releases/tag/v0.1.0
