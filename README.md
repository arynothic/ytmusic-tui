# ytmusic

A fast, modern terminal client for **YouTube Music** — search, play, queue,
and manage your library without leaving the shell.

Published to npm as **`ytmusic-tui`**; the command is **`ytmusic`**.

Built with strict TypeScript, Clean Architecture, and mpv as the playback
engine. Ships with a full-screen TUI, 500+ tests, and ≥90% test coverage.

**No account is required to search or listen.** YouTube Music is queried
anonymously out of the box; logging in is optional and only unlocks your
playlists and library.

![node >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-10-orange)
![license MIT](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Search everything** — songs, albums, artists, videos, playlists, podcasts
- **Instant playback** — `ytmusic play "Fix You"` starts mpv in the background;
  later commands (`pause`, `next`, …) control it from any terminal
- **Full queue management** — shuffle, repeat, reorder, save/restore named queues
- **Library & playlists** — liked songs, history, full playlist CRUD
- **Lyrics** — plain and synced (LRC) when available
- **Downloads** — optional, via yt-dlp with metadata + album artwork
- **Full-screen TUI** — `ytmusic tui`: now-playing, queue, search, keybindings
- **Auth** — optional browser cookie import; credentials kept in a
  `0600`-permission file in the config directory (no OS keychain/native module)
- **Fast** — SQLite caching (Node's built-in `node:sqlite`), rate limiting,
  retries with jittered backoff
- **Zero native dependencies** — pure JavaScript/WASM-free install: `npm
install -g` needs no compiler and no install-script approvals

## Requirements

- **Node.js 22+** (uses the built-in `node:sqlite`; no native addons)
- **[mpv](https://mpv.io/installation/)** (preferred) or **VLC** (fallback) for playback
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)** for stream URLs and downloads

## Install

```sh
npm install -g ytmusic-tui
ytmusic --version
```

### Run without installing (npx)

No global install needed — run it straight from the npm registry:

```sh
npx -y ytmusic-tui tui                  # full-screen player
npx -y ytmusic-tui search "daft punk"
npx -y ytmusic-tui play "Get Lucky"
npx -y ytmusic-tui now
```

`npx` caches the package after the first run, so subsequent launches are
instant. Use `npx -y ytmusic-tui@latest <command>` to force the newest release.

From source:

```sh
git clone https://github.com/arynothic/ytmusic-cli.git
cd ytmusic-cli
corepack enable        # makes pnpm available
pnpm install
pnpm build
npm link               # puts `ytmusic` on your PATH
```

## Quick start

```sh
# Just works — no login, no cookie, no configuration:
ytmusic search "daft punk"
ytmusic play "Get Lucky"  # ▶ starts playback in the background
ytmusic now               # what's playing
ytmusic pause             # ⏸
ytmusic resume            # ▶
ytmusic next              # next in queue
ytmusic volume 75
ytmusic tui               # full-screen mode (recommended for continuous play)
```

Playback keeps running after the command exits — mpv acts as the playback
daemon, and every `ytmusic` invocation reconnects through its IPC socket.

### Do I need to log in?

Only if you want to **manage your playlists** (`ytmusic playlist …`). Search,
playback, the queue, lyrics, artist and album pages all work anonymously.

When you _do_ want to log in, `ytmusic login` walks you through copying the
`Cookie` request header from an authenticated `music.youtube.com` browser
session (or you can pass `--cookie "<header>"` / `--file cookies.txt`). The
cookie is stored in a `0600`-permission file under the config directory
(atomically written, same model the GitHub CLI uses for tokens).

## Commands

| Command                                                                                               | Description                                                          |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ytmusic search <query> [--type …] [--limit n]`                                                       | Search songs/videos/albums/artists/playlists/podcasts                |
| `ytmusic play <query> [--shuffle]`                                                                    | Play the first (or picked) match; remaining results become the queue |
| `ytmusic artist <name>`                                                                               | Artist page: top songs, albums, singles                              |
| `ytmusic album <name>`                                                                                | Album page with its tracks                                           |
| `ytmusic playlist list\|show\|create\|rename\|delete\|add\|remove`                                    | Manage playlists                                                     |
| `ytmusic queue [show\|add\|remove\|move\|clear\|shuffle\|repeat\|play\|save\|restore\|saved\|delete]` | Inspect and manage the queue                                         |
| `ytmusic now`                                                                                         | Currently playing track                                              |
| `ytmusic pause` / `resume` / `stop`                                                                   | Playback control                                                     |
| `ytmusic next` / `previous`                                                                           | Queue navigation                                                     |
| `ytmusic volume <0-100>`                                                                              | Set volume (persisted)                                               |
| `ytmusic seek <seconds>`                                                                              | Seek within the track                                                |
| `ytmusic lyrics [query]`                                                                              | Print lyrics (current track or search)                               |
| `ytmusic download <query>`                                                                            | Download as audio file (yt-dlp)                                      |
| `ytmusic tui`                                                                                         | Full-screen terminal UI                                              |
| `ytmusic login` / `logout`                                                                            | Authentication                                                       |
| `ytmusic cache clear [--history]`                                                                     | Clear caches                                                         |
| `ytmusic config [list\|get\|set\|path]`                                                               | Configuration                                                        |

### TUI keybindings

Queue mode:

| Key                | Action                        |
| ------------------ | ----------------------------- |
| `space`            | play / pause                  |
| `n` / `p`          | next / previous               |
| `↑` `↓` or `k` `j` | move selection                |
| `Enter`            | play selection                |
| `d`                | remove from queue             |
| `s` / `r`          | toggle shuffle / cycle repeat |
| `+` / `-`          | volume                        |
| `←` / `→`          | seek ∓5s / ±5s                |
| `/`                | search                        |
| `q`                | quit (playback continues)     |

Search mode:

| Key         | Action                                   |
| ----------- | ---------------------------------------- |
| _text_      | type the query (all letters are literal) |
| `Enter`     | run the search, then play the selection  |
| `↑` / `↓`   | change the selected result               |
| `Tab`       | enqueue the selected result              |
| `Backspace` | edit the query                           |
| `Esc`       | back to the queue                        |
| `Ctrl-C`    | quit                                     |

While the TUI is open the queue advances automatically when a track ends.

## Configuration

Everything lives in `~/.config/ytmusic-cli` (respects `XDG_CONFIG_HOME`,
overridable with `YTMUSIC_CONFIG_HOME`):

```
config.json     # settings (see `ytmusic config list`)
cache.db        # search/metadata/stream-URL cache + saved queues (SQLite)
history.db      # local playback history (SQLite)
credentials     # login cookie, 0600 permissions
mpv.sock        # IPC socket for cross-process playback control
```

All settings can also be set via environment variables with the `YTMUSIC_`
prefix, e.g. `YTMUSIC_PLAYER_VOLUME=60`.

## How it works

- **mpv as the daemon.** The first `play` spawns mpv (detached) with a fixed
  IPC socket; every later command connects to it. That's how `ytmusic pause`
  works from a different terminal.
- **youtubei.js** for the YouTube Music API (cookie-based sessions).
- **yt-dlp** resolves playable audio URLs; results are cached until shortly
  before their ~6h expiry.
- **Persistence** uses Node's built-in `node:sqlite` (no native addon); the
  only external binaries are mpv/VLC and yt-dlp.
- **Clean Architecture** throughout: `cli → commands → services → core ports`,
  with `player/`, `repositories/`, `auth/`, `cache/`, `config/` implementing
  the ports. A tiny typed DI container wires everything in `cli/context.ts`.
  See [CONTRIBUTING.md](CONTRIBUTING.md) for the dependency rules.

## Troubleshooting

| Symptom                                     | Fix                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `yt-dlp is required for playback…`          | Install [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) and make sure it is on `PATH`.                                     |
| `No supported audio player found on PATH`   | Install [mpv](https://mpv.io/installation/) (preferred) or VLC. Set `player.mpvPath`/`player.vlcPath` for non-standard paths.      |
| `ytmusic pause` says _nothing is playing_   | Nothing is loaded yet. Start playback first with `ytmusic play` or `ytmusic tui`.                                                  |
| Search returns no results                   | Run `ytmusic cache clear` (a stale cache), then retry; otherwise check your network.                                               |
| `AUTH_REQUIRED` on playlist commands        | Those commands need login; everything else does not. Run `ytmusic login` or ignore them.                                           |
| Playback stops when the terminal/TUI closes | By design, mpv is detached and keeps playing; only the TUI advances the queue automatically. Use `ytmusic next` from any terminal. |
| `dist/cli.js` works but `ytmusic` does not  | Re-run `pnpm build && npm link` so the shim points at the fresh bundle.                                                            |

Diagnostics:

```sh
ytmusic config path                 # where config/db/socket live
ytmusic config get logging.level    # set to "debug" for verbose file logs
tail -f "$(ytmusic config path)/ytmusic-cli.log"
```

## Development

```sh
pnpm install
pnpm dev -- play "Fix You"   # run from source (tsx)
pnpm typecheck               # tsc --noEmit (strict)
pnpm lint                    # eslint (typed rules, no-cycle)
pnpm test                    # vitest (490+ tests)
pnpm test:coverage           # v8 coverage, thresholds enforced
pnpm build                   # tsup → dist/cli.js
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Release history lives in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT
