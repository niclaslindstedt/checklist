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

_None pending._

### Severity 5–6 — friction

#### R7. Google Drive adapter never maps HTTP 429 to `RateLimitError`

The `StorageBackend` error taxonomy includes `RateLimitError`
(`src/storage/adapter.ts:120`), and the sync engine routes it to a
user-visible `"throttled"` status (`src/app/use-checklist-sync.ts:149`).
Dropbox honours the contract — it catches 429 and throws `RateLimitError`
with a clamped `Retry-After` (`src/storage/dropbox/index.ts:409`). Google
Drive (`src/storage/gdrive/index.ts`, 660 lines) has **zero** 429 handling:
its `gdriveError` helper only special-cases 401 → `AuthError`
(`gdrive/index.ts:88`), so a Drive 429 surfaces as a raw
`Error("…save failed: 429")` the UI can't recognise. The `"throttled"`
affordance exists but Drive can never reach it — a contract divergence
between two interchangeable backends.

**Plan.** Teach `gdriveError` (or the shared mapper R9 proposes) to
translate 429 → `RateLimitError(retryAfterMs)`, reading the `Retry-After`
header with the same 5s floor Dropbox uses. ~10 lines plus a unit test
asserting a 429 response throws `RateLimitError`.

**Risk.** Low code risk, but Drive's OAuth/save path has **no automated
coverage** — exercise a real save against Google Drive after the change.
Low probability in single-device use (Drive write quotas are high), which
caps the severity below the 7–8 band. **Severity: 6.**

#### R8. `gdrive/index.ts` is the largest file in the tree and inlines its OAuth setup

`src/storage/gdrive/index.ts` is **660 lines** — the largest source file
in the repo, ~95 longer than the next (`themes.ts`, 565). Dropbox (509)
stays smaller precisely because it delegates its OAuth primitives to the
shared `src/storage/oauth-pkce.ts` (245); gdrive inlines its GIS (Google
Identity Services) script-loading and token-client setup
(~`gdrive/index.ts:511–660`) directly. The asymmetry makes it cheaper to
bolt Drive-specific logic onto the already-large file than to push it back
as a shared capability.

**Plan.** Extract the GIS OAuth setup into `src/storage/gdrive/oauth.ts`
(mirroring how Dropbox leans on `oauth-pkce.ts`), leaving `index.ts` as the
adapter factory. ~150 lines move; pure relocation, no behaviour change.
Optionally lift the folder-hierarchy cache helpers into `gdrive/hierarchy.ts`
as a second PR.

**Risk.** Pure module relocation, but `tests/storage/gdrive.test.ts` is
coupled to the current structure — keep the public factory signature stable.
Smoke-test a real Drive connect/save after the move (no automated OAuth
coverage). **Severity: 5.**

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

#### R6. icons.tsx is a 475-line append-only barrel

`src/ui/icons.tsx` (475 lines, up from 401 at the last sweep) is touched in
8/30 commits — every feature that needs a glyph appends an export here. It is
approaching half the 1000-line cap.

**Plan.** Lower priority: these are additive re-exports/inline SVGs that
*usually* merge cleanly (distinct lines), so the conflict cost is real but
small. If it grows, split by theme (nav icons, status icons, action icons)
into sibling files re-exported from `icons.tsx`. Re-rate upward if the file
nears the cap or conflicts recur.

**Risk.** Trivial; purely mechanical. **Severity: 3 (easy win, marginal).**

#### R9. HTTP-error mapping is hand-rolled at every cloud request site

The "read the body, log it, throw a typed error" sequence repeats ~13 times
across the two cloud adapters: gdrive funnels through a local
`gdriveError(op, status, body)` helper (10 call sites,
`src/storage/gdrive/index.ts:88`) while Dropbox throws inline
(`res.text().catch(…)` ×8). The two paths diverge — gdrive maps
401 → `AuthError`, Dropbox additionally maps 429 → `RateLimitError` — which
is exactly the seam R7 patches.

**Plan.** Lift one shared `mapHttpError(res, { provider, op })` into
`src/storage/adapter.ts` (or a sibling `http-error.ts`) that owns the full
taxonomy (401 → `AuthError`, 429 → `RateLimitError`, else generic `Error`)
plus the safe body read. Both adapters call it; R7 falls out for free.
N = 13 call sites — a genuine helper extraction.

**Risk.** Low; consolidation only. Land R7 and R9 together since they touch
the same mapping. **Severity: 4 (easy win).**

#### R10. `migrateLegacyDefault` is duplicated across the two cloud adapters

Both cloud adapters carry a one-time legacy-document relocation with the same
control flow — probe the pre-namespaces document, move it into the namespace
folder, recover by re-reading the destination if a concurrent device won the
race: `src/storage/gdrive/index.ts:217–247` and
`src/storage/dropbox/index.ts:304–330`. The *shape* is identical; the API
calls (Drive `addParents`/`removeParents` PATCH vs. Dropbox `move_v2`) differ.

**Plan.** Extract a `migrateNamespaceLegacy(ops)` helper parameterised over a
small `{ probe, move, retryRead }` interface each adapter satisfies, so the
subtle race-recovery branch lives and is tested once.

**Risk.** **Not a mechanical move** — designing the `ops` seam across two
divergent APIs is real work, and there are only 2 call sites, so the
abstraction may cost more than the duplication saves. Re-rate **upward** when
a 3rd cloud backend (OneDrive/S3) makes it a 3-way copy; until then it's
marginal. No automated cloud coverage — smoke-test both migrations.
**Severity: 4.**

## Landed

- **R3. use-checklist.ts split into a thin composer + the persistence
  engine** (2026-06). Step 2 of the fat-hook breakup: the debounced-save
  plumbing (`performSave` / `flushSave` / `scheduleSave`), the `conflict` /
  `status` / `dirty` state machine, `reload` / `saveNow` / `resolveConflict`,
  the adapter-swap / unmount effects, and `withActiveList` moved to
  `src/app/use-checklist-sync.ts` (`useChecklistSync`, 278 lines).
  `use-checklist.ts` dropped 362 → 176 lines and is now a pure composer of
  the sync engine, the undo timeline, and the edit verbs over the selectors
  and the memoized public surface. The undo↔sync construction cycle (undo's
  `setData` needs sync's `setDoc` / `scheduleSave`; sync's load / reload /
  conflict-adopt paths need undo's `reset`) is broken by a `resetHistory`
  ref the composer owns and points at `reset` once the timeline exists. The
  public `useChecklist` shape is unchanged (`ConflictState` / `SaveStatus`
  re-exported from the barrel), so App and the views don't move. Step 1
  (2026-06) had already moved the six edit verbs to
  `use-checklist-edits.ts`. The save plumbing had **no automated coverage**,
  the flagged risk — landed alongside `tests/app/use-checklist-sync.test.ts`
  covering the save/undo/reload cycle and a conflict-adopt round trip. The
  fat-hook smell is now fully retired.

- **R2. Prop-drilling replaced by two focused contexts (`ChecklistContext`,
  `NavContext`)** (2026-06). `src/ui/checklist-context.ts` publishes the
  whole `useChecklist` surface plus the derived `SyncInfo`;
  `src/ui/nav-context.ts` publishes the drawer/view state and the
  floating-button position. `ChecklistView` and `ArchiveView` became
  prop-free, and `SideMenu` shed eleven props (open/toggle/close/current/
  navigate/dragging from nav, archivedCount/undo/redo/canUndo/canRedo from
  checklist) — only the storage-owned namespace trio stays a prop (a future
  `StorageContext` could absorb it, but storage isn't a churn hub today).
  App stops being the prop conduit: it memoises both context values, and
  `useChecklist`'s return is now memoised too, so the `memo(ChecklistView)`
  optimisation holds (and now also covers cloud sessions, where the fresh
  `sync` object previously defeated it — `sync` is memoised). Both contexts
  live in `ui/` (mirroring the modal bus) so the `ui` consumers stay
  `ui → ui` at runtime; only the `UseChecklist` *type* is imported from
  `app/` (erased). Landed in one PR per the "do high-risk refactors"
  instruction, ~under the 500-line cap.

- **R1. Modal open/close state moved off App.tsx onto a modal command-bus**
  (2026-06). `src/ui/modal-bus.ts` (context + consumer hooks) and
  `src/ui/ModalBusProvider.tsx` (the single-`active`-command provider)
  decouple *who opens a modal* from *who owns its state*. App's three
  `useState`-driven modals (settings + tab, changelog, namespaces — the
  smell had grown past the two the original entry noted) became per-modal
  host files under `src/app/modals/` that read `useModalState(kind)`;
  `SideMenu` shed its `onOpenSettings` / `onOpenChangelog` /
  `onManageNamespaces` props and now `dispatch`es commands directly. Both
  plan steps landed in one PR (~under the 500-line cap). Pull-to-refresh's
  modal gate reads `useAnyModalOpen()` instead of per-modal booleans. The
  bus lives in `src/ui/` (not `src/app/`) so `SideMenu` consuming it stays
  `ui → ui`, not a `ui → app` layering reversal.

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
- **Extracting Dropbox's `authedFetch` 401 → refresh → retry wrapper into
  `oauth-pkce.ts`.** `oauth-pkce.ts` exports the token primitives (`startAuth`
  / `completeAuth` / `refreshAccessToken`) but not the "on 401, refresh once,
  retry" wrapper, which lives inline in Dropbox
  (`src/storage/dropbox/index.ts:223–258`). Tempting to "complete" the shared
  module — but Google Drive uses GIS tokens that **can't** be refreshed, so it
  will never use the wrapper, and Dropbox is the only refresh-token backend
  today. Extracting now is the speculative-abstraction anti-pattern the skill
  warns against (a single caller). Land it **with** the PR that adds a second
  refresh-token backend (Azure/OneDrive), not before — it would rate ~5 once a
  second consumer exists, 1–2 today.
