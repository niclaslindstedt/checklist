# Agent guidance for checklist

This file is the canonical source of truth for AI coding agents working in this
repo. `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, `GEMINI.md`,
`.aider.conf.md`, and `.github/copilot-instructions.md` are symlinks to this
file.

## OSS Spec conformance

This repository adheres to [`OSS_SPEC.md`](OSS_SPEC.md), a prescriptive
specification for open source project layout, documentation, automation, and
governance. A copy of the spec lives at the repository root so contributors and
AI agents can consult it without leaving the repo; its version is recorded in
the YAML front matter at the top of the file.

Run `oss-spec validate .` to verify conformance. When in doubt about a layout,
naming, or workflow decision, consult the relevant section of `OSS_SPEC.md` —
it is the source of truth for the conventions this repo follows.

## Build and test commands

```sh
make build         # developer build
make test          # full test suite
make lint          # zero-warning linter
make fmt           # format in place
make fmt-check     # verify formatting (CI)
```

## Commit and PR conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.

## Architecture summary

`checklist` is a TypeScript PWA that runs entirely in the browser and
is served as static files from GitHub Pages. There is **no backend**.

The source tree under `src/` is organized by concern, not by file type:

- `src/app/` — the root component, routing, and top-level state.
- `src/ui/` — presentational components and styles. UI may import from
  `domain/` and `storage/` (via interfaces) but not the other way.
- `src/domain/` — pure functions over the data model (templates,
  checklists, items). No DOM, no I/O. Should be trivially testable.
- `src/storage/` — pluggable persistence. `LocalStorage` is the
  default; `GoogleDrive` and `Dropbox` adapters implement the same
  `StorageBackend` interface and are loaded on demand.
- `src/share/` — URL-fragment encode/decode for shareable lists.
- `src/pwa/` — service worker, manifest, install prompt handling.

Dependency direction: `ui → domain`, `ui → storage`, `storage →
domain`. Nothing in `domain/` may import from `ui/`, `storage/`, or
the DOM.

## Where new code goes

| Change type | Goes in |
|---|---|
| New UI surface       | `src/ui/...` |
| New domain rule      | `src/domain/...` |
| New storage backend  | `src/storage/<provider>/...` |
| Tests                | `tests/...` (mirror the `src/` path) |
| Docs update          | `docs/...` |
| Example template     | `examples/<slug>.json` |
| LLM prompt           | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`) |

## Test conventions

- **All tests live in separate files** — never inline in source files. No test harnesses inside source modules.
- Test files use the `.test.ts` suffix (e.g. `share.test.ts`) so the stem matches `_?[Tt]ests?$` per §20 of `OSS_SPEC.md`.
- Tests live in `tests/`, mirroring the `src/` tree. Use Vitest. Mock the storage layer at the `StorageBackend` interface — never reach into `localStorage` directly from a test.
- Domain code in `src/domain/` should have unit tests with no DOM. UI tests use Vitest's `jsdom` environment.

## Source file size

- Non-test source files must stay under **1000 physical lines** (§20.5 of `OSS_SPEC.md`). When a file grows past the limit, prefer splitting by concern (extracting submodules, helpers, or sibling files) over relaxing the cap.
- A file may opt out by placing `oss-spec:allow-large-file: <reason>` in any comment within its first 20 lines. The reason must be non-empty and motivate why the file genuinely cannot be split (generated code, cohesive state machine, third-party snapshot, inherently dense rule catalogue).

## Documentation sync points

When you change… | Update…
--- | ---
the `StorageBackend` interface | `docs/architecture.md`, `docs/configuration.md`
the share URL format            | `docs/architecture.md`, `README.md` Usage
user-facing settings            | `docs/configuration.md`, `README.md` Configuration
the build / deploy pipeline     | `README.md` Install/Quick start, `.github/workflows/pages.yml`

## Parity / cross-cutting rules

- **No third-party network calls.** The app may talk to (a) its own
  origin on GitHub Pages, and (b) the Google Drive / Dropbox APIs
  **only when the user has explicitly chosen that backend**. No
  analytics, no font CDNs, no error-reporting SaaS. New dependencies
  that phone home are blocked.
- **Storage backends are interchangeable.** Anything added to one
  backend (e.g. conflict resolution) must work for all three
  (`LocalStorage`, `GoogleDrive`, `Dropbox`) or be expressed as
  capabilities the UI can feature-detect.
- **Shareable URLs stay client-side.** Share payloads live in the URL
  fragment (`#...`) and must never appear in the path or query string;
  fragments are not sent to servers.
- **`src/domain/` is pure.** No imports from `ui/`, `storage/`,
  `window`, `document`, or `fetch`. Enforced by lint rule and CI.

## Maintenance skills

Per §21 of `OSS_SPEC.md`, this repo ships agent skills for keeping drift-prone artifacts in sync with their sources of truth. Skills live under `.agent/skills/<name>/` and are also accessible via the `.claude/skills` symlink.

| Skill | When to run |
|---|---|
| `maintenance`    | When several artifacts have likely drifted at once — umbrella skill that runs every `update-*` skill in the correct order. |
| `sync-oss-spec`  | Before a release, or any time `OSS_SPEC.md` upstream has likely moved. |
| `update-docs`    | After any change to the `StorageBackend` interface, user-facing settings, or share-URL format. |
| `update-readme`  | After any change to install/build commands, the user-visible feature set, or the hosted URL. |
| `update-prompts` | After any change to an LLM prompt's source of truth. |
| `update-website` | After any change to the README or docs that should be reflected in the marketing page. |

Each skill has a `SKILL.md` (the playbook) and a `.last-updated` file (the baseline commit hash). Run a skill by loading its `SKILL.md` and following the discovery process and update checklist. The skill rewrites `.last-updated` at the end of a successful run, and improves itself in place when it discovers new mapping entries. The `maintenance` skill owns a **Registry** table listing every `update-*` skill — add a row whenever you create a new sync skill.