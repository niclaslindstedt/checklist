# Contributing to checklist

Thanks for your interest! This document describes how to set up a dev
environment, the conventions we follow, and how to get a change merged.

## Prerequisites

- **Node.js ≥ 20** (used for tooling only — the app runs in the browser)
- A modern browser for manual testing
- `npm` (bundled with Node)

## Getting the source

```sh
git clone https://github.com/niclaslindstedt/checklist.git
cd checklist
npm install
```

## Build, test, lint

```sh
make build       # vite build → dist/
make test        # vitest run
make lint        # eslint + tsc --noEmit
make fmt-check   # prettier --check
```

The app is a static TypeScript bundle. There is no server component
and no Node runtime at request time.

## Development workflow

1. Fork the repo.
2. Create a topic branch: `git checkout -b feat/<slug>` or `fix/<slug>`.
3. Make focused commits using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   <type>(<scope>): <summary>
   ```
   Types: `feat`, `fix`, `perf`, `docs`, `test`, `refactor`, `chore`, `ci`,
   `build`, `style`. Breaking changes: `<type>!:` or `BREAKING CHANGE:` footer.
4. Open a PR. The **PR title** must be conventional-commit format because we
   squash-merge and that title becomes the commit message on `main`.
5. CI must be green and at least one reviewer must approve.

## Tests

Tests live in `tests/`, mirroring the `src/` tree, with the suffix
`.test.ts`. Run the whole suite with `npm test` or a single file with
`npm test -- tests/domain/templates.test.ts`.

Domain code in `src/domain/` must have unit tests with no DOM access.
UI tests use Vitest's `jsdom` environment. The cloud-storage adapters
are tested against the `StorageBackend` contract — do **not** mock at
the `fetch` level; mock the adapter interface instead.

## Privacy invariant

Pull requests that add **any** outbound network call to a host other
than the user-chosen storage backend will be rejected. This includes
analytics, fonts, error trackers, and CDN-loaded scripts. If you need
a font or icon set, vendor it.

## Documentation

If your change touches user-visible behavior, update the relevant `docs/`
topic and the README quick start. See `AGENTS.md` for the full sync table.

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do **not** open public issues for security
problems.