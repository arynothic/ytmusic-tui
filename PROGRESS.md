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

| #   | Scope                                                                                                                                                                                                                                             | Tests after |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Scaffold: package.json, tsconfig(strict), tsup, vitest, eslint(typed, no-cycle), prettier, husky, lint-staged, CI/dependabot/renovate, editorconfig                                                                                               | 2           |
| 2   | types/ (utility types), core/errors/ (AppError taxonomy, invariant, retryable, normalize), utils/ (sleep, retry w/ jitter, token-bucket limiter, time, exec, env, logger)                                                                         | 73          |
| 3   | models/ (zod: Track/Album/Artist/Playlist/Lyrics/Queue/Search/Config/Credentials/Stream/History, branded IDs, acyclic graph), core/ports/ (7 interfaces), DI container + tokens                                                                   | 98          |
| 4   | config/ (XDG paths, cosmiconfig loader, env overrides, ConfigService), composition root, `ytmusic config` cmd, fatal-error handler, EPIPE safety                                                                                                  | 138         |
| 5   | cache/ (openDatabase, migrations via user_version, ttl), repositories/ (SqliteCacheStore/HistoryStore/QueueStore, corrupt-row self-healing)                                                                                                       | 163         |
| 6   | auth/ (KeytarSecretStore, FileSecretStore 0600 atomic+mutex, FallbackSecretStore, cookie parser header+Netscape, SessionManager), MockMusicGateway test backbone                                                                                  | 200         |
| 7a  | services/gateway/ (MusicClient narrow iface, loose zod mappers, error-normalizer, YouTubeMusicGateway w/ rate-limit+retry+continuation tokens), services/stream/ (YtDlpStreamResolver w/ SQLite URL cache), context wiring                        | 235         |
| 7b  | Gateway + stream-resolver test suites (fake MusicClient, continuation roundtrip, shelf classification, playlist CRUD, yt-dlp parse/cache/failure modes)                                                                                           | 289         |
| 8   | player/ (mpv JSON IPC backend + reconnect/spawn lifecycle, VLC RC fallback backend, availability factory), MockPlayerBackend, real-mpv integration smoke test                                                                                     | 331         |
| 9   | services/ app layer: queue-engine (pure) + QueueService, PlaybackService (auto-advance), Search/Library/Playlist/Lyrics/Download/Auth services, LazyPlayerBackend, full context wiring, MockQueueStore/MockHistoryStore                           | 401         |
| 10  | UI kit (tables, highlight, spinner, picker) + all commands (search/play/artist/album/playlist/queue/controls/now/lyrics/auth/cache/download), mpv-as-daemon cross-process playback, keytar CJS interop fix, CLI test harness (ServiceTestContext) | 443         |
| 11  | cli/tui/ Ink full-screen mode: NowPlayingPanel w/ progress bar, scrollable QueuePanel, SearchPanel, keybindings, `tui` command, ink-testing-library tests                                                                                         | 449         |
| 12  | README/CONTRIBUTING/CHANGELOG, coverage push to ≥90% lines (context/vlc-rc/pipe-safety/ttl/sleep/pick/spinner/ui-kit/command tests), coverage thresholds enforced, VLC RC prompt-prefix parsing fix                                               | 493         |

**PROJECT COMPLETE (v0.1.0).** Current: **493 tests passing** (incl. 1 real-mpv integration test),
coverage **92.3% lines / 91.9% stmts / 92.4% funcs / 81.2% branches** (thresholds enforced:
≥90/90/90/80), `pnpm typecheck/lint/format:check/test/build` all green, `dist/cli.js` smoke-tested.

### Lessons from increment 11 (don't relearn)

- Ink `useInput` handlers close over render state — rapid sequential keypresses read STALE
  state. Mirror mutable state into a ref (`stateRef.current = {...}` each render) and read
  refs in handlers; for player status, ask the service (`playback.now()`) instead of React state.
- Tests must sync on rendered frames between dependent keypresses (React re-render → ref update
  is async): write '/', waitFor 'Search:', then type.
- TUI quit leaves mpv playing (resident daemon); the command just persists the queue and exits.

## Commands working today

`search play artist album playlist queue pause resume stop next previous volume seek now lyrics download login logout cache config tui` (+ `--help`/`--version`).

## Next increments

None — all 12 increments done. See README.md / CONTRIBUTING.md / CHANGELOG.md (this log
is kept as historical record of design decisions).

### Lessons from increment 10 (don't relearn)

- **Playback daemon = mpv itself.** Fixed IPC socket path (config dir / named pipe on win32);
  every CLI invocation connects first, spawns (detached+unref) only when unreachable.
  `socket.unref()` + `child.unref()` let one-shot processes exit while mpv plays on.
  Resident-state sync on attach: `path`/`pause`/`time-pos`/`volume` (track metadata comes
  from the persisted queue). Only end-file `reason=eof|error` → idle (replace/stop/quit filtered).
- Live queue persists across processes via QueueStore name `_current`; commands load+persist.
- keytar is CJS: named ESM imports work in vitest but crash in bundled dist — use default
  import + destructure. ALWAYS smoke-test `dist/cli.js`, not just vitest.
- ora: `isEnabled: process.stdout.isTTY` keeps piped output clean (no custom no-op needed).
- `Partial<PlayerSnapshot>` keeps readonly — build patches with conditional spreads.
- CLI command tests: register commands on fresh Command + ServiceTestContext (container wired
  with mocks); non-TTY means pickers return first result and login requires flags.

## Commands working today

`search play artist album playlist queue pause resume stop next previous volume seek now lyrics download login logout cache config` (+ `--help`/`--version`).

## Next increments

11. cli/tui/ Ink full-screen mode + hooks
12. README/CONTRIBUTING/CHANGELOG, coverage thresholds ≥90%, final verification

Test doubles ready: `tests/mocks/mock-music-gateway.ts`, `tests/mocks/mock-cache-store.ts`,
`tests/mocks/mock-player-backend.ts`, `tests/mocks/mock-queue-store.ts`,
`tests/mocks/mock-history-store.ts`,
`tests/helpers/` (temp-dir, test-context w/ stdout+stderr capture, fixtures, ServiceTestContext).

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

### Lessons from increment 9 (don't relearn)

- "idle" means different things per backend: mpv emits `end-file` for eof AND replace/stop/quit —
  filter by `reason` (only eof/error → idle). VLC `--play-and-exit` exits for natural end AND
  our kills — track intentional kills in a WeakSet. Only natural ends trigger auto-advance.
- Container factories are sync; player detection is async → `LazyPlayerBackend` proxy wires
  listeners exactly once (Map<listener, unsub>) and reports a static idle snapshot pre-init.
- `no-unused-private-class-members` false-positives on `#field ??=` — use an explicit read instead.
- zod `.nullable()` on a schema enables negative-result caching (lyrics miss ≠ cache miss).
- yt-dlp `--newline` + `--print after_move:filepath` gives line-based progress + the final path;
  progress parses from `[download]  42.3%`.
- MockMusicGateway.addTracksToPlaylist requires seeded tracks; SecretStore requires isAvailable().
- Queue semantics: after next()→null at queue end, currentIndex stays — previous() then steps
  back from the last track (so it returns the second-to-last).

## Next increments

10. commands/: search play artist album playlist queue now pause resume stop volume next
    previous lyrics login logout cache download + UI kit (tables, highlight, spinners)
11. cli/tui/ Ink full-screen mode + hooks
12. README/CONTRIBUTING/CHANGELOG, coverage thresholds ≥90%, final verification

Test doubles ready: `tests/mocks/mock-music-gateway.ts`, `tests/mocks/mock-cache-store.ts`,
`tests/mocks/mock-player-backend.ts`, `tests/mocks/mock-queue-store.ts`,
`tests/mocks/mock-history-store.ts`,
`tests/helpers/` (temp-dir, test-context w/ stdout+stderr capture, fixtures).

## Verify

```sh
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Note: on this machine `pnpm` runs via corepack (`corepack pnpm ...`); node via fnm.
