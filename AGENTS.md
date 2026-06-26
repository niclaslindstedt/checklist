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
| Feature doc (large feature's "Learn more") | `docs/features/<slug>.md` (see `Releases and changelog` → "Feature docs and Learn more") |

## Test conventions

- **Always ship tests with the code.** New code lands with tests that
  exercise it, and changed code lands with its tests added or updated in
  the **same PR** — never as a follow-up. A bug fix carries a regression
  test that fails before the fix and passes after; a refactor leaves
  coverage no lower than it found it (see the `refactor` skill). If a unit
  is hard to test, that's a signal to make it more testable (extract a pure
  function, inject the dependency), not to skip the test.
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
a user-facing feature, capability, or data-access behaviour | The **`/home` showcase page** (`src/ui/ShowcasePage.tsx`) and `SHOWCASE_ROUTE` in `src/seo/routes.ts` — keep its feature list and data-use copy accurate in the same PR. See "The `/home` showcase page".
a **large** user-facing feature (the changelog bullet links `[Learn more]`) | `docs/features/<slug>.md` in the same PR — keep it accurate to current behaviour. See "Releases and changelog" → "Feature docs and Learn more".

## The `/home` showcase page

The app serves a standalone **showcase homepage** at `/home`
(`/preview/home`, `/branch/home` under the other slots) — a no-login
marketing page that doubles as the **app homepage linked from the Google
OAuth consent screen**. Google's verification requires that homepage to
identify the app, fully describe its functionality, explain with
transparency why the app requests user data, and link to the privacy
policy — all visible without logging in. It is built exactly like the
privacy page: `src/ui/ShowcasePage.tsx` is a self-contained React view (no
app state, English-only), mounted by the path switch in `src/app/main.tsx`
and emitted to `dist/home/index.html` by the `emit-showcase-alias` plugin
in `vite.config.ts`. Its `<head>` SEO, sitemap entry, and `<noscript>`
fallback come from `SHOWCASE_ROUTE` in `src/seo/routes.ts`.

**Keep it in sync with the product.** Because Google holds us to "fully
describe your app's functionality" and "explain the purpose for which your
app requests user data", the showcase must not drift from what the app
actually does:

- **Ship or remove a user-facing feature** → add or drop the matching
  bullet in the "What you can do with it" list in `ShowcasePage.tsx`.
- **Change what data the app accesses, which provider, or the OAuth
  scope** (Google Drive / Dropbox, app-folder vs. broader) → update the
  "Why the app asks for access to your data" section so the stated purpose
  and scope stay exact. This copy and the privacy policy must agree.
- **Rename the app, change the hosted domain, or restructure storage** →
  reflect it in both the page body and `SHOWCASE_ROUTE`'s title/description
  (the SEO test caps the title at 70 and the description at 160 chars).

Treat the showcase page as part of the same change that touches a feature
or a data-access path, never as a follow-up.

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

The `bump` input on `.github/workflows/release.yml` (`workflow_dispatch`
only) defaults to **`auto`**, which derives the bump from the
`.changes/unreleased/` fragments rather than asking a human — the release
takes the **highest** level any waiting fragment implies:

- `patch` — bug fixes, no visible behaviour change beyond the fix.
  Implied by `type: Fixed | Security`.
- `minor` — new user-facing feature or visible behaviour change.
  Implied by `type: Added | Changed | Removed | Deprecated`. Most common.
- `major` — breaking change to the persisted-data shape an older build
  cannot read, or a deliberate UX overhaul. Implied by **`breaking: true`**
  on any fragment (regardless of its `type:`).

`scripts/release/compute-bump.mjs` is the single source of that mapping
(unit-tested in `tests/release/compute-bump.test.ts`). Override the
derivation by dispatching with an explicit `patch | minor | major`.

### Changeset fragments

When a PR introduces a **user-visible** change, drop a small markdown
file in `.changes/unreleased/<unix-ts>-<slug>.md`:

```
---
type: Added
title: Custom domain
doc: namespaces
---

One sentence users will read in the changelog.
```

`type:` is one of `Added | Changed | Fixed | Removed | Security |
Deprecated` (Keep a Changelog). `title:` (optional, expected for
`Added` / `Changed`) is a short noun phrase bolded at the head of the
bullet; `doc:` (optional) is the slug of a feature doc (see below);
`breaking:` (optional — `true` / `yes` / `1`) flags a change an older
build cannot survive and forces the release to a **major** bump (see
"Semver and release cadence"); the body is a **one-sentence** summary.
The collator renders the bullet as
`- **<title>** — <summary> [Learn more](feature:<doc>)`. The timestamp
prefix on the filename keeps the lexical sort deterministic so collation
roughly mirrors commit order. Fragment parsing lives in
`scripts/release/fragments.mjs`, shared by the collator
(`scripts/release/collate-changelog.mjs`) and the bump deriver
(`scripts/release/compute-bump.mjs`) so the two never disagree on what a
valid fragment is — an unknown `type:`, a malformed front-matter line, or
an empty body fails the run loudly.

**Keep the bullet to one sentence.** The title + one-sentence summary
shape is what keeps the in-app "What's new" modal scannable — if you
catch yourself writing a second or third clause, the depth belongs in a
feature doc, not the bullet.

#### Feature docs and "Learn more"

A **feature doc** is a long-form markdown file at
`docs/features/<slug>.md` — a leading `# Title` heading, then the
multi-paragraph explanation of one feature. The build inlines every doc
into the bundle (`src/ui/changelog/feature-docs.ts`, via
`import.meta.glob`), and a changelog bullet that carries
`[Learn more](feature:<slug>)` opens the matching doc **in place** inside
the changelog modal, with a back button — rendered by the same
dependency-free markdown renderer (`src/ui/markdown/renderMarkdown.tsx`)
that handles item notes. The `feature:<slug>` link scheme works in any
markdown the modal renders, so a doc can cross-link sibling docs.

**A feature doc exists only to back a changelog "Learn more" link.** It
is **not** general product documentation, a manual, or a home for design
notes — that lives in `docs/overview.md`, `docs/architecture.md`, and the
rest of `docs/`. A feature doc is the long-form half of one changelog
bullet, and nothing reads it except the "What's new" modal. If you find
yourself wanting to document something that no changelog bullet links to,
it does not belong here.

**Reach for one sparingly — big features only.** Most fragments are just
`title:` + one sentence with **no** `doc:`. Add a doc **only when the
feature genuinely cannot be summarized in about two sentences** — one
whose honest explanation runs to several paragraphs or a real "how it
works" walkthrough (cloud sync, namespaces, achievements, themes, the
checklist gestures, the archive, navigation, local-folder sync). A small
setting, a visual tweak, a secondary facet of a larger feature, or a bug
fix does **not** get a doc. If the change extends an already-documented
big feature, fold a line into that feature's existing doc rather than
adding a link — but only that feature's primary changelog bullet carries
the `[Learn more]`; the facet bullets stay link-free.

**One doc per feature, one feature per doc — never shared.** Every
`[Learn more]` link points at a doc about **only that feature**, and every
doc is linked from **exactly one** changelog bullet. Do not point two
bullets at the same `doc:` slug (a facet bullet must not borrow its
parent's doc), and do not let one doc sprawl across several unrelated
features. A doc may *cross-link* a sibling feature's doc with
`[label](feature:<slug>)`, but its own subject stays singular. When you
retire a feature, delete its doc and drop the link in the same PR so no
orphan doc or dead `feature:` link is left behind.

When you do add `doc:`, **create `docs/features/<slug>.md` in the same
PR** — a `doc:` slug with no matching file renders the link as an inert
dead end. Feature docs are **English-only** (like the rendered CHANGELOG
body); write them in plain second-person user voice with no implementation
jargon, and shorten the bullet to one sentence once the depth has moved
into the doc. `docs/` is in the changeset skip-list, so a docs-only
feature-doc edit needs no fragment of its own.

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

1. Maintainer dispatches the `Release` workflow. The `bump` input
   defaults to `auto` (derived from the waiting fragments by
   `scripts/release/compute-bump.mjs`); a `patch | minor | major` value
   overrides it.
2. The workflow resolves the bump, then runs
   `npm version <bump> --no-git-tag-version` and
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
| `copy-feature`      | Bring a feature, look, modal, or behaviour over from the sibling `budget` repo — clone it, study the feature in place, and re-implement it adapted to the checklist domain. |
| `release`           | Cut a new semver release: pre-flight checks, dispatch `release.yml`, verify the deploy, roll back. |
| `write-changeset`   | Before opening a PR, decide whether it needs a `.changes/unreleased/` fragment, a parent-fragment edit, or the `no-changelog` label. |
| `debug-from-logs`   | When the user pastes diagnostic output (console errors, stack traces, `make test` / `make build` failures) — trace it to a root cause and add regression coverage. |
| `dependabot`        | Clear the open Dependabot queue by consolidating every bump into one green PR. |
| `design`            | Iterate on the look or layout of the UI through an edit / reload / screenshot loop against the dev server. |
| `find-optimizations`| Survey the hot paths for order-of-magnitude performance wins (or report honestly that none remain). |
| `fix-comments`      | Remove or rewrite changelog-style comments while preserving comments that explain current invariants. |
| `refactor`          | Work (or extend) the refactor backlog in `docs/refactoring-roadmap.md`, one roadmap row per PR. |
| `tune-pwa-icons`    | Manage the PWA manifest (`vite.config.ts`) and icon assets in `public/`. |