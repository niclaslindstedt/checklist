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
make changelog VERSION=X.Y.Z   # preview a release's CHANGELOG locally
```

## Commit and PR conventions

- All commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- PRs are squash-merged; the **PR title** becomes the single commit on `main`,
  so it must follow conventional-commit format.
- Breaking changes use `<type>!:` or a `BREAKING CHANGE:` footer.
- Every PR with a **user-visible** change ships a changeset fragment
  under `.changes/unreleased/` (see "Releases and changelog"). The
  `changeset` CI job enforces this; opt out with the `no-changelog`
  label when a change is genuinely invisible to users.

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

## Resolving user vocabulary

The user (and team) refer to parts of the app in plain English — "the
list", "the sync glyph", "swipe to archive", "the drag button", "keep
mine". These words rarely match filenames one-to-one. **Before
searching for code, look the term up in
[`docs/dictionary.md`](docs/dictionary.md)** — it maps every term the
codebase has accreted to the concrete component, type, or file it
points at. The dictionary is the **index**: a term resolves to the most
specific file and the symbols to grep for, and stops there. Once you
have the file, **[`docs/overview.md`](docs/overview.md) is where to read
how that subsystem behaves and what else it touches** — it carries a
full description for every dictionary term, under the same headings,
one-to-one. Look the word up in the dictionary to find the code; read
the same word in the overview to understand it. (Deep module /
persisted-shape mechanics live in `docs/architecture.md`.)

**Keep both in lockstep with the code, in the same PR.** When you:

- ship a feature that introduces a user-facing concept,
- rename a file or symbol the dictionary mentions,
- change how a feature behaves, or
- **hear the user use a word the dictionary doesn't already cover** —
  the "ah, when they said _that_ they meant _this_" moment —

add or update the entry in the same pull request as the code change:
the `overview.md` description (the bulk of the work) and the matching
`dictionary.md` row (often just a pointer to the file). Every
dictionary term has an overview entry and vice versa; letting either
rot defeats the purpose. If the user uses a term you can't find in
`docs/dictionary.md` and can't infer from filenames, ask before
guessing — then record the answer so the next agent doesn't have to.

## Where new code goes

| Change type | Goes in |
|---|---|
| New UI surface       | `src/ui/...` |
| New domain rule      | `src/domain/...` |
| New storage backend  | `src/storage/<provider>/...` |
| New achievement      | `src/achievements/catalog.ts` (+ glyph in `glyphs.tsx`) **and** `src/i18n/locales/{en,sv}/achievements.ts` (see "Achievements") |
| Tests                | `tests/...` (mirror the `src/` path) |
| Docs update          | `docs/...` |
| Example template     | `examples/<slug>.json` |
| LLM prompt           | `prompts/<name>/<major>_<minor>_<patch>.md` (see `prompts/README.md`) |
| Changelog entry      | `.changes/unreleased/<unix-ts>-<slug>.md` (see `Releases and changelog`) |

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
a user-facing concept, component, or term (added, renamed, or a new word the user uses) | `docs/dictionary.md` (the term → file row) **and** `docs/overview.md` (the term's description) — both in the same PR. See "Resolving user vocabulary".
a user-facing feature / workflow / surface (shipped or removed) | **Add (or retire) a matching achievement** in the same PR — see "Achievements". Every feature is also an unlockable trophy.

## Achievements

The app ships an **achievements** system, ported from the budget project:
every user-facing feature is also an unlockable trophy, sorted into four
tiers that mirror how far the user has grown into the app —
**Beginner → Intermediate → Pro → Expert**. The trophy button in the
checklist header opens the guided tour of the whole catalog when it's
quiet; when one or more unlocks are unacknowledged it lights up with a
badge and instead opens an unlock-notification modal listing just the new
ones (closing that clears the queue). A fresh unlock also raises a toast.

It lives in three places that must stay in lockstep:

- **The catalog** — `src/achievements/catalog.ts`: each entry's `id`
  (stable, write-once), `tier`, `glyph`, optional `hasLearnMore` flag, and
  unlock `trigger`. Glyphs are inline SVGs in
  `src/achievements/glyphs.tsx` (the app stays dependency-free — no
  `lucide-react`). No display strings here.
- **The i18n strings** — `achievements.catalog.<id>.{name,condition,
  learnMore?}` in **both** `src/i18n/locales/en/achievements.ts` and
  `src/i18n/locales/sv/achievements.ts`. The Swedish file is typed against
  the English one, so a missing key is a compile error; the catalog test
  (`tests/achievements/catalog.test.ts`) also checks parity.
- **The renderer** — `src/ui/achievements/AchievementsModal.tsx` reads the
  catalog by `id` and pulls strings via `t()`. New entries appear
  automatically without touching it.

A trigger is either **`derived`** — a predicate over `(prev, next)` of the
combined `{ snapshot, settings }` state that flips false→true (use this
whenever the feature mutates the persisted document or the synced
settings) — or **`manual`**, fired by calling `unlock("<id>")` from the
chokepoint that observes the gesture (cloud connect, clipboard copy, undo,
install, language switch). The watcher
(`src/achievements/useAchievementWatcher.ts`) runs the derived pass on
every transition and drains the manual-unlock bus
(`src/achievements/bus.ts`). **Every `manual` entry must have a wired
`unlock("<id>")` call** — the catalog test fails otherwise.

When adding an achievement, use the **`update-achievements`** skill: it
picks the tier, phrases the copy (English **and** Swedish), wires the
trigger, and adds the test. Progress lives in the synced
`Settings.achievements` map, so it travels with the user across devices.

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

## Releases and changelog

### Deployment slots

The app is hosted on GitHub Pages under the custom domain
**checklist.niclaslindstedt.se** (set by `public/CNAME`, which Vite
copies into every build; the Pages workflow keeps a single CNAME in the
root of the artifact). `.github/workflows/pages.yml` assembles up to
three slots into one Pages artifact:

- `/` — the latest released `v*` tag. Before the first release exists,
  `main` is served here instead (no `/preview/` slot yet).
- `/preview/` — the current `main`. Every push to `main` rebuilds it.
- `/branch/` — an opt-in, stable slot for a feature branch. A maintainer
  dispatches `pages.yml` (`workflow_dispatch`) with a `branch_ref`; the
  build is force-pushed to the auto-managed `branch-deploy` orphan
  branch and rehydrated into every subsequent deploy until the next
  dispatch overwrites it. Delete the `branch-deploy` branch to clear the
  slot.

The base path each slot is built with comes from `VITE_BASE` (`/`,
`/preview/`, or `/branch/`), read by `vite.config.ts`.

> **Storage caveat.** All three slots share one origin, and
> `localStorage` / `IndexedDB` are per-origin (not per-path), so
> `/preview/` and `/branch/` currently read and write the **same** data
> as production. If you need true isolation between slots, namespace the
> storage keys by base path before using the preview/branch slots for
> destructive testing.

### Semver and release cadence

Bumps are chosen at release time via the `bump` input on
`.github/workflows/release.yml` (`workflow_dispatch` only):

- `patch` — bug fixes, no visible behaviour change beyond the fix.
- `minor` — new user-facing feature or visible behaviour change.
  Default and most common.
- `major` — breaking change to the persisted-data shape an older build
  cannot read, or a deliberate UX overhaul.

### Changeset fragments

When a PR introduces a **user-visible** change, drop a small markdown
file in `.changes/unreleased/<unix-ts>-<slug>.md`:

```
---
type: Added
title: Custom domain
---

One sentence users will read in the changelog.
```

`type:` is one of `Added | Changed | Fixed | Removed | Security |
Deprecated` (Keep a Changelog). `title:` (optional, expected for
`Added` / `Changed`) is a short noun phrase bolded at the head of the
bullet; the body is a **one-sentence** summary. The timestamp prefix on
the filename keeps the lexical sort deterministic so collation roughly
mirrors commit order. The collator
(`scripts/release/collate-changelog.mjs`) validates the front-matter at
release time — an unknown `type:`, a malformed front-matter line, or an
empty body fails the run loudly.

The `changeset` job in `ci.yml` enforces a fragment per PR. Pure
refactors, CI / build / test tweaks, dependency bumps that don't change
behaviour, and docs-only edits pass via the skip-list in
`scripts/release/check-changeset.mjs` — extend it when adding new
"obviously not user-visible" path patterns. Opt a genuinely invisible
change out by labelling the PR `no-changelog`.

**Don't add a fragment for fixes to features introduced since the last
release.** If the feature's `Added` fragment is still sitting in
`.changes/unreleased/`, fold the fix into that fragment instead of
adding a sibling `Fixed` entry that narrates a regression no user saw.

Preview a release locally with `make changelog VERSION=X.Y.Z` — this
**consumes** the fragments, so run it on a scratch branch or revert
afterwards.

### End-to-end release flow

1. Maintainer dispatches the `Release` workflow with a
   `patch | minor | major` bump.
2. The workflow runs `npm version <bump> --no-git-tag-version` and
   `scripts/release/collate-changelog.mjs`, which converts
   `.changes/unreleased/*.md` into a new `## [X.Y.Z] - YYYY-MM-DD`
   section in `CHANGELOG.md` and deletes the consumed fragments.
3. It commits the bump + changelog + fragment deletion, tags `vX.Y.Z`,
   and pushes both to `main`.
4. `gh release create` publishes a GitHub Release whose body is the new
   section (sliced by `scripts/release/extract-section.mjs`).
5. The workflow chains into `pages.yml` via `workflow_call` so the new
   tag is served at `/` immediately, without waiting for the next push.

To cut a release from an earlier commit (when `main` has advanced past
the intended release point), set the optional `commit` input — the
workflow tags that commit and pushes **only the tag**, leaving `main`
untouched. Reconciling `main` afterwards is the maintainer's job.

## Maintenance skills

Per §21 of `OSS_SPEC.md`, this repo ships agent skills for keeping drift-prone artifacts in sync with their sources of truth. Skills live under `.agent/skills/<name>/` and are also accessible via the `.claude/skills` symlink.

| Skill | When to run |
|---|---|
| `maintenance`    | When several artifacts have likely drifted at once — umbrella skill that runs every `update-*` skill in the correct order. |
| `sync-oss-spec`  | Before a release, or any time `OSS_SPEC.md` upstream has likely moved. |
| `update-docs`    | After any change to the `StorageBackend` interface, user-facing settings, or share-URL format. |
| `update-readme`  | After any change to install/build commands, the user-visible feature set, or the hosted URL. |
| `update-prompts` | After any change to an LLM prompt's source of truth. |
| `update-achievements` | After shipping (or removing) a user-facing feature — keep the achievements catalog and its English/Swedish copy in sync with the feature surface. |

Each skill has a `SKILL.md` (the playbook) and a `.last-updated` file (the baseline commit hash). Run a skill by loading its `SKILL.md` and following the discovery process and update checklist. The skill rewrites `.last-updated` at the end of a successful run, and improves itself in place when it discovers new mapping entries. The `maintenance` skill owns a **Registry** table listing every `update-*` skill — add a row whenever you create a new sync skill.

## Task skills

Alongside the drift-sync skills above, the repo ships manual playbooks for recurring engineering tasks. These are **not** part of the `maintenance` umbrella — invoke them directly when the situation calls for it. They live under the same `.agent/skills/<name>/` tree.

| Skill | When to run |
|---|---|
| `commit`            | Commit staged changes, push, and open/update a PR with a conventional-commit title. |
| `release`           | Cut a new semver release: pre-flight checks, dispatch `release.yml`, verify the deploy, roll back. |
| `write-changeset`   | Before opening a PR, decide whether it needs a `.changes/unreleased/` fragment, a parent-fragment edit, or the `no-changelog` label. |
| `debug-from-logs`   | When the user pastes diagnostic output (console errors, stack traces, `make test` / `make build` failures) — trace it to a root cause and add regression coverage. |
| `dependabot`        | Clear the open Dependabot queue by consolidating every bump into one green PR. |
| `design`            | Iterate on the look or layout of the UI through an edit / reload / screenshot loop against the dev server. |
| `find-optimizations`| Survey the hot paths for order-of-magnitude performance wins (or report honestly that none remain). |
| `fix-comments`      | Remove or rewrite changelog-style comments while preserving comments that explain current invariants. |
| `refactor`          | Work (or extend) the refactor backlog in `docs/refactoring-roadmap.md`, one roadmap row per PR. |
| `tune-pwa-icons`    | Manage the PWA manifest (`vite.config.ts`) and icon assets in `public/`. |