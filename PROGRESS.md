# ytmusic-cli — Project Status & Architecture Log

> Working document tracking what has been built, key decisions, and what's next.
> Will be superseded by README.md / CONTRIBUTING.md / CHANGELOG.md before release.

## Goal

Production-quality terminal client for YouTube Music: TypeScript (strict, ESM, Node 22+),
pnpm, Commander.js, Ink TUI, zod, pino, Vitest, tsup, better-sqlite3, keytar,
youtubei.js (chosen over the Python ytmusicapi bridge), yt-dlp for stream URLs,
mpv (primary) / VLC (fallback) playback.

## Verified environment

Node 22.21.1, pnpm 10.28.2, mpv, vlc, yt-dlp, ffmpeg, libsecret all present.

## Architecture (Clean Architecture)

```
cli/ commands/ hooks/  →  services/  →  core/ (ports, errors, container)
                                            ↑
repositories/ cache/ auth/ player/ config/ ─┘   (implement core ports)
models/ types/ utils/  (leaf modules — imported by all, import nothing in src)
```

- Dependency rule enforced by `eslint-plugin-import-x` `no-cycle`.
- Hand-rolled typed DI container (`core/container.ts`), composition root in `cli/context.ts`.
- All boundary data validated with zod (config file, API payloads, SQLite rows, credentials).
- Every error is a custom `AppError` subclass with stable `code` + sysexits-style `exitCode`.
- youtubei.js v17 note: `MusicSearchType` has no `podcast`; podcast search maps to
  playlist-typed search + `item_type === 'podcast_show'` items. Sessions are cookie-based
  (`Innertube.create({ cookie, visitor_data, retrieve_player: false })`).
- Vendor types use private members (nominal), so the gateway depends on a narrow
  `MusicClient` interface with `unknown` payloads + loose zod schemas (version-resilient,
  trivially testable). The cast from the real `Innertube` happens once, in the factory.

## Increments completed (each verified: typecheck + lint + tests + build)

| #   | Scope                                                                                                                                                                                                                      | Tests after |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Scaffold: package.json, tsconfig(strict), tsup, vitest, eslint(typed, no-cycle), prettier, husky, lint-staged, CI/dependabot/renovate, editorconfig                                                                        | 2           |
| 2   | types/ (utility types), core/errors/ (AppError taxonomy, invariant, retryable, normalize), utils/ (sleep, retry w/ jitter, token-bucket limiter, time, exec, env, logger)                                                  | 73          |
| 3   | models/ (zod: Track/Album/Artist/Playlist/Lyrics/Queue/Search/Config/Credentials/Stream/History, branded IDs, acyclic graph), core/ports/ (7 interfaces), DI container + tokens                                            | 98          |
| 4   | config/ (XDG paths, cosmiconfig loader, env overrides, ConfigService), composition root, `ytmusic config` cmd, fatal-error handler, EPIPE safety                                                                           | 138         |
| 5   | cache/ (openDatabase, migrations via user_version, ttl), repositories/ (SqliteCacheStore/HistoryStore/QueueStore, corrupt-row self-healing)                                                                                | 163         |
| 6   | auth/ (KeytarSecretStore, FileSecretStore 0600 atomic+mutex, FallbackSecretStore, cookie parser header+Netscape, SessionManager), MockMusicGateway test backbone                                                           | 200         |
| 7a  | services/gateway/ (MusicClient narrow iface, loose zod mappers, error-normalizer, YouTubeMusicGateway w/ rate-limit+retry+continuation tokens), services/stream/ (YtDlpStreamResolver w/ SQLite URL cache), context wiring | 235         |
| 7b  | Gateway + stream-resolver test suites (fake MusicClient, continuation roundtrip, shelf classification, playlist CRUD, yt-dlp parse/cache/failure modes)                                                                    | 289         |
| 8   | player/ (mpv JSON IPC backend + reconnect/spawn lifecycle, VLC RC fallback backend, availability factory), MockPlayerBackend, real-mpv integration smoke test                                                              | 331         |

Current: **331 tests passing** (incl. 1 real-mpv integration test, auto-skipped without mpv+ffmpeg),
`pnpm typecheck/lint/test/build` all green.

### Lessons from increment 7 (don't relearn)

- `Innertube` instance structurally satisfies the narrow `MusicClient` interface — NO cast needed
  (private members in the _source_ don't block assignment _to_ a plain interface).
- youtubei.js v17 `MusicSearchType` = all/song/video/album/playlist/artist — no podcast;
  podcasts surface as `item_type: 'podcast_show'` in playlist-typed searches.
- Search continuation is object-based (call `.getContinuation()` on the response), not token-based;
  gateway maps opaque tokens → in-process response objects in `#continuations`.
- Vendor classes carry private fields → never type mapper inputs as vendor classes; the loose
  zod schemas in `loose-schemas.ts` parse class instances fine (property access).
- Word-boundary regex gotcha: "Coldplay" contains "play" — use `\b...\b` in subtitle filters.

### Lessons from increment 8 (don't relearn)

- mpv JSON IPC: newline-delimited JSON over `--input-ipc-server` socket; replies correlate by
  `request_id`, everything else is an event. Snapshot stays fresh via `observe_property`
  (pause/time-pos/volume) — no polling. `end-file` → idle is the queue-advance signal.
- VLC RC (`-I rc --rc-host 127.0.0.1:PORT --rc-quiet`) is line-based; `pause` is a TOGGLE,
  volume scale is 0-256 (ours 0-100). VLC has no idle mode → one `--play-and-exit` process
  per track; process exit = track end. Position via `get_time` polling (injectable poller).
- Both backends take injectable spawner/connector/sleep; unit tests use fakes, and
  `tests/integration/mpv-backend.integration.test.ts` smoke-tests real mpv with a
  3s ffmpeg-generated sine tone (skipIf binaries missing).
- Getter-in-harness gotcha: destructuring a lazy getter evaluates it immediately —
  access `harness.pollCallback` AFTER `play()`, not via destructure.
- Server-push assertions need `vi.waitFor` (TCP delivery is async even on loopback).

## Commands working today

`ytmusic config [list|get|set|path]`, `--help`, `--version`.

## Decisions log

- zod v4: `.prefault()` for nested config defaults; `.brand()` for IDs; `z.iso.datetime()`.
- typescript pinned to ^5.9 (typescript-eslint compat; TS 7 is the new default on npm).
- cosmiconfig `.load()` throws ENOENT on missing file → treated as "defaults".
- better-sqlite3 needs `esModuleInterop` (types use `export =`).
- cache.db holds cache_entries + saved_queues (shared user_version migration sequence);
  history.db separate. Corrupt rows are deleted + treated as misses.
- FileSecretStore serializes ops via async mutex; atomic tmp+rename writes; 0600/0700 perms.
- EPIPE on stdout/stderr → clean exit 0 (pipe to `head` safe).
- Player backends keep their own snapshot (no polling for mpv; RC polling for VLC) and
  translate process/IPС events into PlayerSnapshot streams; services never touch processes.

## Next increments

9. services/ app layer: queue-engine (pure), SearchService, PlaybackService, QueueService,
   LibraryService, PlaylistService, LyricsService, DownloadService, AuthService
10. commands/: search play artist album playlist queue now pause resume stop volume next
    previous lyrics login logout cache download + UI kit (tables, highlight, spinners)
11. cli/tui/ Ink full-screen mode + hooks
12. README/CONTRIBUTING/CHANGELOG, coverage thresholds ≥90%, final verification

Test doubles ready: `tests/mocks/mock-music-gateway.ts`, `tests/mocks/mock-cache-store.ts`,
`tests/mocks/mock-player-backend.ts`,
`tests/helpers/` (temp-dir, test-context w/ stdout+stderr capture, fixtures).

## Verify

```sh
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Note: on this machine `pnpm` runs via corepack (`corepack pnpm ...`); node via fnm.
