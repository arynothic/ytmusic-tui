# Contributing to ytmusic-cli

Thanks for helping out. This document explains the development workflow and
the architectural rules that keep the codebase consistent.

## Setup

```sh
git clone https://github.com/arynothic/ytmusic-cli.git
cd ytmusic-cli
corepack enable
pnpm install
```

Verify your environment before touching code:

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Everything must be green on a clean checkout. CI runs exactly these commands.

## Workflow

1. Create a branch from `main`.
2. Make small, self-contained changes — the project is built in "increments"
   that each keep the project buildable and tested.
3. Run `pnpm typecheck && pnpm lint && pnpm test` before every commit
   (the pre-commit hook runs lint-staged automatically).
4. Open a PR. Squash-merge keeps history tidy.

## Architecture rules

These are enforced by tooling and review; please don't bypass them.

### Dependency direction

```
cli/ commands/ hooks/  →  services/  →  core/ (ports, errors, container)
                                            ↑
repositories/ cache/ auth/ player/ config/ ─┘   (implement core ports)
models/ types/ utils/  (leaf modules — import nothing else in src)
```

- `eslint-plugin-import-x` `no-cycle` is an error, not a warning.
- Commands never talk to infrastructure directly; they resolve services from
  the DI container (`Tokens.*`).
- Services depend on **ports** (interfaces in `core/ports/`), never on
  concrete adapters.

### Types & validation

- Strict TypeScript. **No `any`** (`@typescript-eslint/no-explicit-any` is an error).
- Everything crossing a boundary (config file, API payloads, SQLite rows,
  credentials, process output) is validated with **zod**. Loose schemas at
  the vendor boundary, strict schemas in `models/`.
- Every error is a custom `AppError` subclass with a stable `code` and a
  sysexits-style `exitCode`. Never throw bare `Error` from `src/`.

### Testing

- Unit tests mirror the source tree under `tests/unit/`.
- Command tests use `tests/helpers/test-context.ts` (`createServiceTestContext`)
  which wires the container with in-memory doubles from `tests/mocks/`.
- Integration tests that need real binaries live in `tests/integration/` and
  must self-skip when the binary is missing (see the mpv smoke test).
- Coverage thresholds (≥90% lines/statements/functions, ≥80% branches) are
  enforced by `pnpm test:coverage`.
- Non-TTY by default in tests: interactive prompts must have a non-interactive
  fallback path, which is what tests exercise.

### Style

- Prettier formats on commit; don't fight it.
- Every exported function/class has a JSDoc comment.
- Keep modules single-responsibility; prefer composition over inheritance;
  avoid cleverness (KISS).

## Commit messages

Short imperative summaries scoped to the increment, e.g.
`increment 11: Ink full-screen TUI`. Reference issues when relevant.

## Reporting bugs

Include: the command you ran, the full stderr output (redact cookies!),
`ytmusic --version`, OS, and whether mpv or VLC was used.
