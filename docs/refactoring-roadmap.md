# Refactoring roadmap

The single source of truth for what this codebase considers a code smell
worth fixing. Worked via the `refactor` skill (`.agent/skills/refactor/`):
**Work mode** lands the highest-leverage pending item one PR at a time;
**Explore mode** surveys for new smells and appends them here without
touching code.

## Strategic context

The goal is to keep the codebase clean and the layering honest so new UI
surfaces, new storage backends (the `StorageBackend` interface must stay
interchangeable across LocalStorage / Google Drive / Dropbox), and new
share / template features stay easy to add. The dependency direction is
`ui → domain`, `ui → storage`, `storage → domain`; nothing in
`src/domain/` may import from `ui/`, `storage/`, `window`, `document`, or
`fetch` (lint-enforced).

**This roadmap was bootstrapped from a conflict-resistance sweep.** The
recurring pain is that parallel feature branches keep colliding on a small
set of "hub" files. Measured over the last 30 non-merge commits:

| File | Touched in | Role |
|---|---|---|
| `src/app/App.tsx` | **16 / 30 (53%)** | root wiring hub |
| `src/ui/ChecklistView.tsx` | 11 | prop-drilled view |
| `src/app/use-checklist.ts` | 9 | central state hook (~20-field return) |
| `src/ui/icons.tsx` | 8 | icon barrel |
| `src/ui/SideMenu.tsx` | 6 | second hub (nav + footer menu) |

The control case proving the cure: `.changes/unreleased/` fragments were
touched in 24 of those 30 commits with ~zero conflicts, because each is a
new timestamped file rather than an edit to a shared region. **The unit of
change is a new file, not an edit to a hub.** Most rows below are about
moving feature wiring off the hubs and onto that pattern.

### What the sibling repo does (budget)

`checklist` was ported from `niclaslindstedt/budget`, which carries far
more features yet sees few conflicts. The patterns it uses — and that this
roadmap selectively adopts — are:

- **Thin app root + small focused hooks.** budget's per-concern dialog /
  selection hooks each own one slice of state; the shell instantiates them
  side by side instead of one fat hook returning everything.
- **Modal command-bus.** A `ModalCommand` discriminated union plus a
  handler registry (`useRegisterModalHandlers`) decouples *who opens a
  modal* from *who owns its state*, so a new modal is a new host file + one
  union arm — no new `useState` + prop chain in the root.
- **Feature/view registry.** `SHEET_TYPE_REGISTRY` is a list of descriptors
  (id, label, glyph, component, validators); adding a sheet is a new
  descriptor file + one registry line, not edits to the dispatcher and
  every router conditional.
- **Per-feature locale and reducer modules** assembled at one barrel, so
  domains never touch each other's files.

**Calibrate to size.** checklist is a small app (App.tsx is ~416 lines, not
budget's 1391-line shell; two top-level views; a handful of modals). Adopt
the *shape* of these patterns where the churn evidence justifies it — do
not port budget's heavy machinery wholesale. A registry for two views is
speculative; the prop-drilling and fat-hook smells the earlier sweeps
retired were real, and the storage-wiring hub the current sweep flags is
real today.

## Severity rubric

Fix threshold is **3**. Below 3 is cosmetic — don't add it.

| Band | What to look for |
| ---- | ---------------- |
| 9–10 | Architectural blocker. Correctness / persistence risk, a broken layering edge, or a `StorageBackend` divergence every backend bumps into. |
| 7–8  | Multiplier. Local today; every new storage backend / UI surface / share feature threads through it. |
| 5–6  | Friction. Slows iteration; readers stumble. Worth landing soon. |
| 3–4  | Nit with leverage. Cheap to fix; alternative call-sites would multiply if left alone. |
| 1–2  | Cosmetic. Don't add to the roadmap; if it ever bothers anyone enough, it'll re-surface. |

Refactor rules (full text in the skill): no behaviour changes, respect the
layering, aim for <500 lines of diff per PR, run `make lint && make test`,
and update this file in the same PR.

## Pending

### Severity 7–8 — multipliers

_None pending._

### Severity 5–6 — friction

#### R1. `useStorageBackend.ts` is the largest file in the tree and wires every backend's lifecycle inline

`src/storage/useStorageBackend.ts` is **679 lines** — the largest source
file in the repo. It is a single hook that wires all four backends
(browser, folder, Dropbox, Google Drive) end to end: ~13 `useState` calls,
the folder File-System-Access probe on boot, the Dropbox OAuth-redirect
completion effect, the Dropbox/Drive token state, and the encryption
wrapping that sits over all of them. Worse, the backend-selection branching
is **duplicated**: the same `dropbox → gdrive → folder → fallback` if-chain
is written twice, once to build the document `adapter` (~lines 303–344) and
again to build the `settingsStore` (~lines 351–380), with parallel
dependency arrays. Every new backend (or a tweak to an existing one)
threads through both chains.

**Plan.** Two seams, smallest first:

1. **Easy partial (the duplicated branching).** Extract a single
   `buildBackendAdapters(...)` that returns `{ adapter, settingsStore }` in
   one pass, collapsing the two parallel if-chains. ~80 lines removed,
   mechanical, low risk. Land this first.
2. **Larger end state (the god hook).** Shard the per-backend lifecycle
   into focused driver hooks (`useDropboxBackend()`, `useFolderBackend()`,
   …) that each own their own state + effects, leaving the top-level hook a
   thin router that selects among them. Multi-PR; keep the public hook
   surface stable so `App` and the settings tabs don't move.

**Risk.** The Dropbox redirect-completion effect, the folder-probe
cancellation, and the encryption unlock gate must all keep their current
ordering and cleanup. The OAuth/cloud paths have **no automated coverage**
— smoke-test a real Dropbox and Google Drive connect/save after the move,
plus the folder probe. **Severity: 6.** (Step 1 alone is a severity-4 easy
win; the full driver split is the 6.)

#### R2. Google Drive adapter never maps HTTP 429 to `RateLimitError` — a contract divergence

The `StorageBackend` taxonomy includes `RateLimitError` (`adapter.ts`), and
Dropbox honours it: it catches HTTP 429 and throws
`RateLimitError(Math.max(headerMs, RATE_LIMIT_FALLBACK_MS))` off the
`Retry-After` header (`src/storage/dropbox/index.ts:322–327`). Google Drive
(`src/storage/gdrive/index.ts`, 519 lines) has **zero** 429 handling
(`grep -n 429 src/storage/gdrive/index.ts` returns nothing): a Drive 429
falls through `gdriveError(op, status, body)` and surfaces as a generic
`Error`, so the user-visible `"throttled"` affordance the sync engine wires
up can never be reached on Drive. Two interchangeable backends diverge on
the same contract. The "read body / log / throw typed error" sequence is
also hand-rolled per request site across both adapters (gdrive funnels
through `gdriveError`; Dropbox throws inline), so the mapping logic is
duplicated as well as divergent.

**Plan.** Lift one shared `mapHttpError(res, { provider, op })` into
`src/storage/adapter.ts` (or a sibling `http-error.ts`) owning the full
taxonomy (401 → `AuthError`, 429 → `RateLimitError(retryAfterMs)` with the
5s floor, else generic `Error`) plus the safe body read. Both adapters call
it; the Drive 429 gap closes for free. The extraction is a pure refactor;
note that the Drive side gains a *new* user-visible affordance (it can now
report `"throttled"`), so that slice is a behaviour-correctness change, not
pure relocation — split it out and ship it with a changeset if it lands
separately from the extraction.

**Risk.** Low code risk, but Drive's save path has **no automated coverage**
— exercise a real Drive save (and confirm Dropbox 429 still maps, covered
by `tests/storage/dropbox.test.ts`). Drive write quotas are high so the gap
rarely bites in single-device use, which caps this below the 7–8 band.
**Severity: 6.**

### Easy wins

#### R3. `icons.tsx` is a 613-line append-only barrel and a known churn hub

`src/ui/icons.tsx` (**613 lines**, 32 exported icon functions) is one of
the churn hubs in the table above (touched 8/30 commits): every feature
that needs a glyph appends an export here. It has grown well past half the
1000-line cap (§20.5 of `OSS_SPEC.md`) and keeps climbing.

**Plan.** Split by theme into sibling files (`icons/cloud.tsx`,
`icons/nav.tsx`, `icons/status.tsx`, `icons/action.tsx`) re-exported from
`icons.tsx`, so a new glyph lands in a small family file rather than the
shared barrel. The cloud family already shares a `CloudBase` helper, so it
extracts cleanly first. Purely mechanical re-exports; update import sites or
keep the barrel as a compatibility re-export to avoid churn elsewhere.

**Risk.** Trivial; no logic. These are additive lines that *usually* merge
cleanly, so the conflict cost is real but small — re-rate upward if the file
nears the cap. **Severity: 4 (easy win).**

#### R4. `themes.ts` hand-writes nine 21-field palette literals

`src/theme/themes.ts` (565 lines) carries nine preset palettes
(`DEFAULT_CUSTOM_THEME_COLORS_DARK`/`_LIGHT`/`_DRACULA`/`_MONOKAI`/
`_GITHUB_DARK`/`_GITHUB_LIGHT`/`_SOLARIZED_LIGHT`/`_QUIET_LIGHT`/`_EXCEL`,
~lines 211–398) as standalone 21-field record literals, then ties them
together in the `PRESET_PALETTES` map. Adding a theme means a new ~20-line
literal *plus* an entry in the map — two edit sites — and ~180 lines of the
file is flat colour data.

**Plan.** Move the palettes to a single data array (`[id, colors]` tuples)
and derive both the named constants (where still referenced) and
`PRESET_PALETTES` from it, so a new theme is one array entry. Pure data
refactor; `customThemeSeed()` keeps its behaviour and its existing tests.

**Risk.** Low; data-only. Palettes don't collide often, which keeps this
marginal — land opportunistically while touching the file. **Severity: 3
(easy win, marginal).**

## Landed

_None yet — roadmap reset 2026-06; history preserved in git._

## Investigated and skipped

- **Extracting Dropbox's `createAuthedFetch` 401 → refresh → retry wrapper
  into `oauth-pkce.ts`.** Dropbox's authed-fetch wrapper
  (`src/storage/dropbox/index.ts:172–231`) silently refreshes on 401 and
  retries once. Tempting to "complete" the shared OAuth module by lifting
  it — but Google Drive uses GIS popup tokens that **cannot** be refreshed,
  so it will never use the wrapper, and Dropbox is the only refresh-token
  backend today. Extracting now is the speculative-abstraction anti-pattern
  (a single caller). Land it **with** the PR that adds a second
  refresh-token backend (Azure/OneDrive/S3), not before — it would rate ~5
  once a second consumer exists, 1–2 today.
- **App.tsx modal-host / context-provider nesting and SideMenu row-styling
  duplication.** The current sweep examined `App.tsx`'s nested
  provider+modal-host return (~lines 362–414) and the three near-identical
  menu-row components in `SideMenu.tsx` (`NavItem` / `MenuButton` /
  `MenuLink`). Both are readability/cosmetic only (rated <3): the nesting
  has no bad logic and both files sit well under the size cap. Not added —
  re-surface only if `App.tsx` grows another wave of modals or the menu-row
  styling system starts diverging.
