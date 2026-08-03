# ytmusic-cli

A fast, modern terminal client for **YouTube Music** — search, play, queue,
and manage your library without leaving the shell.

Built with strict TypeScript, Clean Architecture, and mpv as the playback
engine. Ships with a full-screen TUI, 490+ tests, and ≥90% test coverage.

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
- **Secure auth** — browser cookie import, OS keychain storage (keytar) with
  encrypted-file fallback
- **Fast** — SQLite caching, rate limiting, retries with jittered backoff

## Requirements

- **Node.js 22+**
- **[mpv](https://mpv.io/installation/)** (preferred) or **VLC** (fallback) for playback
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp#installation)** for stream URLs and downloads
- Linux only: `libsecret` (e.g. `apt install libsecret-1-0`) for keychain storage;
  without it, credentials fall back to a `0600`-permission file

## Install

The package is not on npm yet — install from source:

```sh
git clone https://github.com/arynothic/ytb-cli.git ytmusic-cli
cd ytmusic-cli
corepack enable        # makes pnpm available
pnpm install
pnpm build
npm link               # puts `ytmusic` on your PATH
```

## Quick start

```sh
# Optional for search/playback; required for library & playlists
ytmusic login          # paste your browser Cookie header when asked

ytmusic play "Fix You" # ▶ starts playback in the background
ytmusic now            # what's playing
ytmusic pause          # ⏸
ytmusic resume         # ▶
ytmusic next           # next in queue
ytmusic volume 75

ytmusic tui            # full-screen mode
```

Playback keeps running after the command exits — mpv acts as the playback
daemon, and every `ytmusic` invocation reconnects through its IPC socket.

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

## Configuration

Everything lives in `~/.config/ytmusic-cli` (respects `XDG_CONFIG_HOME`,
overridable with `YTMUSIC_CONFIG_HOME`):

```
config.json     # settings (see `ytmusic config list`)
cache.db        # search/metadata/stream-URL cache + saved queues (SQLite)
history.db      # local playback history (SQLite)
credentials     # file fallback when no OS keychain is available
mpv.sock        # IPC socket for cross-process playback control
```

All settings can also be set via environment variables with the `YTMUSIC_`
prefix, e.g. `YTMUSIC_PLAYER_VOLUME=60`.

## How it works

- **mpv as the daemon.** The first `play` spawns mpv (detached) with a fixed
  IPC socket; every later command connects to it. That's how `ytmusic pause`
  works from a different terminal.
- **youtubei.js** for the YouTube Music API (cookie-based sessions).
- **yt-dlp** resolves playable audio URLs; results are cached in SQLite until
  shortly before their ~6h expiry.
- **Clean Architecture** throughout: `cli → commands → services → core ports`,
  with `player/`, `repositories/`, `auth/`, `cache/`, `config/` implementing
  the ports. A tiny typed DI container wires everything in `cli/context.ts`.
  See [CONTRIBUTING.md](CONTRIBUTING.md) for the dependency rules.

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
