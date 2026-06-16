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

**Calibrate to size.** checklist is a small app (App.tsx is 170 lines, not
budget's 1391-line shell; two top-level views; two modals). Adopt the
*shape* of these patterns where the churn evidence justifies it — do not
port budget's heavy machinery wholesale. A registry for two views is
speculative; the prop-drilling and fat-hook smells are real today.

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

#### R1. App.tsx owns every modal's open/close state and threads it as props

`src/app/App.tsx` (170 lines) holds a `useState` per modal (`settingsOpen`,
`changelogOpen`, the settings-tab, …) and threads the openers down as props
(`onOpenSettings`, `onOpenChangelog`) into `SideMenu`. Each new modal adds a
state pair in App **and** a prop on the child's `Props` type, destructure,
and JSX call site — the exact regions every other feature also edits. This
is a large part of App.tsx's 53% churn.

**Plan.** Adopt budget's modal command-bus, sized down: a `ModalCommand`
discriminated union + a context-provided `dispatch` + `useRegisterModalHandlers`.
A button calls `dispatch({ kind: "open-settings" })`; the modal host
registers its handler at mount. Adding a modal becomes a new host file + one
union arm — no App state, no new prop. Ship in steps: (1) introduce the
dispatch context + migrate the two existing modals; (2) drop the now-unused
`onOpenSettings`/`onOpenChangelog` props from `SideMenu`.

**Risk.** Pure refactor, no UX change. Medium blast radius (touches App +
SideMenu + the two modal call sites). Multi-PR. Verify both modals still
open/close and Escape-dismiss. **Severity: 7.**

#### R2. Prop-drilling through fat Props types on SideMenu / ChecklistView

`src/ui/SideMenu.tsx` (333 lines) and `src/ui/ChecklistView.tsx` (137 lines)
take wide `Props` objects that re-export `useChecklist`'s surface (undo/redo,
counts, archive, sync, …). Adding one capability edits three regions in a
shared file — the `Props` type, the destructure, and the JSX call site in
App. This is precisely what collided when the draggable-button PR (#30) and
the menu-in-drawer PR (#29) both landed in `SideMenu`'s function body.

**Plan.** Expose the checklist actions/state and the nav/view state via two
focused React contexts (`ChecklistProvider`, `NavProvider`) instead of prop
chains, following budget's "consume state where you need it" approach. Leaf
components read context; App stops being the prop conduit. Migrate
incrementally — one consumer at a time keeps each PR small.

**Risk.** Pure refactor. Medium. Watch the `memo(ChecklistView)` optimisation
(App comment at the `openSettings`/`openStorageSettings` callbacks) — context
value identity must stay stable or the memo defeats. Split context by update
frequency if needed. **Severity: 7.**

### Severity 5–6 — friction

#### R3. use-checklist.ts is a fat state hook with a ~20-field return

`src/app/use-checklist.ts` (409 lines) returns one object with ~20 fields
(items, archivedItems, checkedCount, addItem, toggle, remove, archive,
unarchive, reorder, reload, conflict, resolveConflict, status, dirty,
saveNow, undo, redo, canUndo, canRedo, snapshot). Every new action edits the
same `return { … }` block and the same interface — a guaranteed collision
point for parallel feature work. budget has ~22 *small* hooks instead of one.

**Plan.** Split by concern into composed hooks — `useChecklistItems` (add /
toggle / remove / reorder), `useChecklistArchive` (archive / unarchive),
`useChecklistSync` (status / dirty / saveNow / reload / conflict), with
undo/redo already separate — re-composed by a thin `useChecklist`. Each
action then lands in a smaller, concern-scoped file.

**Risk.** Pure refactor; the public `useChecklist` shape can stay identical
so App and the views don't change. Low–medium. The file is well under the
1000-line cap, so this is friction not a hard size signal — hence 5, not 7.
**Severity: 5.**

#### R4. Top-level view switching is hardcoded in App and SideMenu

Adding a top-level view (beyond `checklist` / `archive`) means editing the
`View` union, App's conditional render block, and `SideMenu`'s inline nav
list — three shared regions. budget's `SHEET_TYPE_REGISTRY` makes this a new
descriptor file + one registry line.

**Plan.** A small `VIEW_REGISTRY` of descriptors (`id`, `label`, `glyph`,
`component`); App renders `registry[view].component`; SideMenu maps the
registry to nav entries.

**Risk.** Low, pure. **Leverage is latent** — there are only two views today,
so this pays off only once a third is on the horizon. Land it *with* the PR
that introduces a third view, not speculatively before. **Severity: 5.**

### Easy wins

#### R5. i18n locale barrels are append-only in one spot

`src/i18n/locales/en/index.ts` and `…/sv/index.ts` re-assemble per-namespace
catalogs with a manual import + an entry in the exported object. Catalogs are
already split per feature (good) — but adding a namespace still edits the same
import block and object literal in both locale indexes, where parallel feature
strings collide.

**Plan.** Auto-compose the catalog via `import.meta.glob` (eager) so a new
`foo.ts` is picked up with no index edit. Keep the `Catalog` type derivation
working (derive from the glob map). Mechanical, zero behaviour change.

**Risk.** Low; the type derivation needs care so `Widen<typeof en>` stays
correct and `sv` is checked against it. **Severity: 4 (easy win).**

#### R6. icons.tsx is a 401-line append-only barrel

`src/ui/icons.tsx` (401 lines) is touched in 8/30 commits — every feature that
needs a glyph appends an export here. It is approaching half the 1000-line cap.

**Plan.** Lower priority: these are additive re-exports/inline SVGs that
*usually* merge cleanly (distinct lines), so the conflict cost is real but
small. If it grows, split by theme (nav icons, status icons, action icons)
into sibling files re-exported from `icons.tsx`. Re-rate upward if the file
nears the cap or conflicts recur.

**Risk.** Trivial; purely mechanical. **Severity: 3 (easy win, marginal).**

## Landed

_None yet._

## Investigated and skipped

- **`.gitattributes merge=union` on barrels / lists.** Considered as a
  zero-refactor mitigation, but union-merge concatenates both sides' lines
  blindly — safe only for unordered append-only text, and dangerous for the
  typed TS object literals and import blocks where our conflicts actually
  live (it would produce duplicate keys / imports that compile-fail or
  silently shadow). Out of scope for this roadmap (it's a tooling/process
  change, not a code refactor); raise it in CONTRIBUTING if desired, scoped
  to genuinely line-additive files only.
- **Porting budget's full AppShell + lazy page hosts.** budget's shell is
  ~1391 lines with lazy-loaded page hosts per feature. For a two-view app
  that is over-engineering — the proportionate slice (R1 modal bus, R2
  contexts) captures the conflict-resistance benefit without the machinery.
  Revisit only if checklist grows several more top-level surfaces.
