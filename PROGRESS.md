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

| # | Scope | Tests after |
|---|-------|-------------|
| 1 | Scaffold: package.json, tsconfig(strict), tsup, vitest, eslint(typed, no-cycle), prettier, husky, lint-staged, CI/dependabot/renovate, editorconfig | 2 |
| 2 | types/ (utility types), core/errors/ (AppError taxonomy, invariant, retryable, normalize), utils/ (sleep, retry w/ jitter, token-bucket limiter, time, exec, env, logger) | 73 |
| 3 | models/ (zod: Track/Album/Artist/Playlist/Lyrics/Queue/Search/Config/Credentials/Stream/History, branded IDs, acyclic graph), core/ports/ (7 interfaces), DI container + tokens | 98 |
| 4 | config/ (XDG paths, cosmiconfig loader, env overrides, ConfigService), composition root, `ytmusic config` cmd, fatal-error handler, EPIPE safety | 138 |
| 5 | cache/ (openDatabase, migrations via user_version, ttl), repositories/ (SqliteCacheStore/HistoryStore/QueueStore, corrupt-row self-healing) | 163 |
| 6 | auth/ (KeytarSecretStore, FileSecretStore 0600 atomic+mutex, FallbackSecretStore, cookie parser header+Netscape, SessionManager), MockMusicGateway test backbone | 200 |
| 7a | services/gateway/ (MusicClient narrow iface, loose zod mappers, error-normalizer, YouTubeMusicGateway w/ rate-limit+retry+continuation tokens), services/stream/ (YtDlpStreamResolver w/ SQLite URL cache), context wiring | 235 |

Current: **235 tests passing**, `pnpm typecheck/lint/test/build` all green.

## ⚠️ RESUME POINT (session paused 2026-07-20)

Increment 7 is ~90% done. What remains of it:

1. Write `tests/unit/services/gateway/youtube-music-gateway.test.ts`
   - Fake `MusicClient` (plain object, `vi.fn(async () => fixture)` methods) + `factory` returning it; real `TokenBucketRateLimiter` (capacity 100, 1000 rps); pass `retry: { attempts: 2, sleep: noop }` so retries are instant.
   - Vendor fixtures ready in `tests/unit/services/gateway/fixtures.ts`
     (trackNode, albumNode, artistNode, playlistNode, podcastNode, albumPageFixture,
     artistPageFixture, playlistPageFixture, libraryFixture, trackInfoFixture, searchPageFixture).
   - Cover: lazy anonymous client; filter→vendor-type map (`songs`→`song`, `podcasts`→`playlist`, null→`all`); continuation token roundtrip (`has_continuation: true` + `getContinuation` on response object; unknown token → ApiError); `searchPages` generator; authenticate success/failure (getLibrary rejects "…401…" → AuthError); getAuthenticatedUser via `account.getInfo()`; getTrack/getAlbum/getArtist/getPlaylist/getLyrics; getLikedSongs uses playlist id `'LL'`; library shelf classification; history + limit; playlist CRUD (removeVideos called with `useSetVideoIds=true`); error normalization (429 → ApiError API_RATE_LIMITED after retries).
2. Write `tests/unit/services/stream/yt-dlp-stream-resolver.test.ts`
   - `tests/mocks/mock-cache-store.ts` (MockCacheStore) is ready. Inject `run`/`findExec` fakes.
   - Cover: resolve+parse (`-j` JSON: url with `?expire=`, ext, abr), cache hit avoids re-run,
     near-expiry cached URL (within 60s margin) re-resolves, missing binary → STREAM_RESOLVER_MISSING,
     non-zero exit → STREAM_RESOLVE_FAILED, killed → timeout error, bad JSON → STREAM_RESOLVE_FAILED,
     no `expire` param → ~6h fallback expiry.
3. Then verify (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`) and proceed to increment 8 (player/).

### Lessons from increment 7 (don't relearn)

- `Innertube` instance structurally satisfies the narrow `MusicClient` interface — NO cast needed
  (private members in the *source* don't block assignment *to* a plain interface).
- youtubei.js v17 `MusicSearchType` = all/song/video/album/playlist/artist — no podcast;
  podcasts surface as `item_type: 'podcast_show'` in playlist-typed searches.
- Search continuation is object-based (call `.getContinuation()` on the response), not token-based;
  gateway maps opaque tokens → in-process response objects in `#continuations`.
- Vendor classes carry private fields → never type mapper inputs as vendor classes; the loose
  zod schemas in `loose-schemas.ts` parse class instances fine (property access).
- Word-boundary regex gotcha: "Coldplay" contains "play" — use `\b...\b` in subtitle filters.

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

## Next increments

7b. Gateway + resolver test files (see RESUME POINT above)
8. player/ (mpv JSON IPC backend, vlc fallback, availability factory) + MockPlayerBackend
9. services/ app layer: queue-engine (pure), SearchService, PlaybackService, QueueService,
   LibraryService, PlaylistService, LyricsService, DownloadService, AuthService
10. commands/: search play artist album playlist queue now pause resume stop volume next
    previous lyrics login logout cache download + UI kit (tables, highlight, spinners)
11. cli/tui/ Ink full-screen mode + hooks
12. README/CONTRIBUTING/CHANGELOG, coverage thresholds ≥90%, final verification

Test doubles ready: `tests/mocks/mock-music-gateway.ts`, `tests/mocks/mock-cache-store.ts`,
`tests/helpers/` (temp-dir, test-context w/ stdout+stderr capture, fixtures).

## Verify

```sh
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
