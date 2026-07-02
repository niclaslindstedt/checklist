# Refactoring roadmap

The single source of truth for what this codebase considers a code smell
worth fixing. Worked via the `refactor` skill (`.agent/skills/refactor/`):
**Work mode** lands the highest-leverage pending item one PR at a time;
**Explore mode** surveys for new smells and appends them here without
touching code.

## Strategic context

The goal is to keep the codebase clean and the layering honest so new UI
surfaces, new storage backends, and new share / template features stay easy
to add. The dependency direction is `ui → domain`, `ui → storage`,
`storage → domain`; nothing in `src/domain/` may import from `ui/`,
`storage/`, `window`, `document`, or `fetch` (lint-enforced). The three
storage backends (LocalStorage, Google Drive, Dropbox) sit behind one
`StorageBackend` interface and must stay interchangeable — anything added to
one works for all, or is a capability the UI can feature-detect.

Non-test source files stay under the 1000-line cap (§20.5 of `OSS_SPEC.md`);
a file nearing it without an `oss-spec:allow-large-file:` opt-out is a
standing candidate to split by concern.

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

### Severity 9–10 — architectural blockers

_None pending._

### Severity 7–8 — multipliers

_None pending._

### Severity 5–6 — friction

- **`src/domain/checklists.ts` (800 lines) — split the domain grab-bag before
  it breaches the 1000-line cap.** Multi-PR split by concern into sibling
  modules, with `checklists.ts` kept as a barrel re-export so the ~10
  importing files stay untouched and the public API stays byte-identical.
  **Step 1 landed (2026-07):** the tree primitives (`withChildren`,
  `flattenItems`, `findItem`, `updateItem`, `removeItem`, `mapTree`) moved to
  `src/domain/item-tree.ts` (128 lines, the shared foundation every other
  concern imports); the barrel re-exports the two public ones and imports the
  four internal helpers for local use. `checklists.ts` dropped 905→800.
  **Remaining seams (one PR each, in dependency order):**
  - **`checklist-ops.ts`** — checklist-level CRUD/metadata (`instantiate`,
    `createChecklist`, `renameChecklist`, `setChecklistAppearance`,
    `setChecklistArchived`, `activeChecklists`, `archivedChecklists`,
    `nextChecklistName`). Independent leaf: uses no tree helpers, so it can be
    lifted in isolation. ~130 lines.
  - **`archive-ops.ts`** — `archiveChecked`, `deleteChecked`, `setArchived`,
    `activeItems`, `archivedItems`, `archivedByChecklist` (+ `ArchivedGroup`).
    Imports `flattenItems`/`mapTree`/`withChildren`/`updateItem` from
    `item-tree.ts`. Extract before `item-ops`/`item-display` since both import
    `activeItems` from it.
  - **`item-ops.ts`** — add/edit/delete/toggle (`addItem`, `addItems`,
    `addItemAfter`, `addItemsAfter`, `editItem`, `deleteItem`, `toggleItem`,
    `setAllChecked`, + private `spliceAfter`). Imports tree helpers and
    `activeItems` (for `setAllChecked`).
  - **`item-display.ts`** — move/reorder/display transforms (`moveItem`,
    `moveItemInto`, `sortCheckedToBottom`, `displayItems`, `moveDisplayedItem`,
    `isComplete`, `progress`, `flattenForDisplay`, + private `structureKey`,
    `insertRelative`; `DropMode`, `DisplayRow`). Imports tree helpers +
    `activeItems`.

  Each seam re-exports its public names through the barrel; internal-only
  helpers stay out of the barrel. The existing `tests/domain/checklists.test.ts`
  keeps importing the barrel and passes unchanged, so a per-seam test-file
  mirror is optional polish, not required — but a newly-exposed private helper
  (as `item-tree`'s four were) is the moment to add its direct unit tests.
  **Risk:** low — pure functions, no DOM/I/O; the barrel keeps the public API
  byte-identical and the full suite pins behaviour. Watch for a `no-op returns
  the same reference` contract when moving helpers: several callers rely on it
  to skip writes. Verify coverage per new file doesn't drop (`item-tree.ts`
  landed at 100%). **Severity: 5.**

### Severity 3–4 — nits with leverage

_None pending._

### Easy wins

_None pending._

## Landed

- **`src/app/App.tsx` sync-status `useMemo` lint warning cleared**
  (2026-07) — the memo's `onReload` closure called `checklist.reload()`
  through the whole object, so `react-hooks/exhaustive-deps` demanded
  `checklist` in the dependency array even though every field was listed
  individually. A `reload` local was already destructured a few lines up
  (`const { reload } = checklist` at line 244, for the pull-to-refresh
  wrapper), so the fix was to point the closure at that existing local and
  swap `checklist.reload` for `reload` in the dep array — no new
  destructure, no behaviour change (same callback reference). `make lint`
  now reports zero warnings; full suite 1125 tests green. Was Severity 3
  (easy win); narrower than the roadmap plan (no new destructure needed).

- **Folder-row family extracted from `SideMenuRows.tsx` into
  `SideMenuFolderRow.tsx`** (2026-07) — moved `FolderRowHeader`,
  `FolderRowDesktop`, `FolderRowTouch`, `FolderRow`, `FolderEditRow`, the
  `OpenMenu` type, and `FOLDER_DROP_CLASS` to the new module (335 lines),
  leaving `SideMenuRows.tsx` (411 lines) to the generic drawer building
  blocks; `REMOVE_ACTION_W` is now exported so both files share one swipe-
  strip geometry. The twice-rendered `FolderRowHeader` prop set is deduped:
  the thin `FolderRow` dispatcher builds the header element once and hands
  it to whichever variant it mounts. Pure presentational relocation, no
  behaviour change — the 8 existing folder-row cases moved to
  `tests/ui/side-menu-folder-row.test.tsx`, and `FolderEditRow`'s
  previously-unpinned commit / cancel / `committed`-latch rules gained 6
  direct cases (written green against the pre-refactor code first). New
  module at 100% line/function coverage; full suite 1125 tests green. Was
  Severity 4 (easy win).

- **`make fmt-check` drift fixed and gated in CI** (2026-07) — reformatted
  the 8 files that had drifted from the lockfile's Prettier 3.8.4
  (`src/app/drag-drop-resolver.ts`, `src/storage/backend-factory.ts`,
  `src/ui/hooks/useComposer.ts`, `src/ui/SideMenuRows.tsx`, and 4 test
  files; line-wrap-only diff) and added `npm run fmt:check` to the `test`
  job in `ci.yml` so formatting drift now fails CI instead of sitting
  unnoticed. Full suite (1119 tests) green. Was Severity 3 (easy win).

## Investigated and skipped

- **`src/ui/SideMenu.tsx` (746 lines) icon-import clutter** (2026-07) — a
  sweep proposal claimed 30+ icon imports obscuring the file's dependency
  footprint; re-verification counts 15 icons from a single `./icons.tsx`
  module, which is ordinary for a nav drawer, and the proposed fix (pass
  icons as props from callers) adds indirection without removing any
  logic. Rated below the fix threshold. The file itself stays cohesive —
  its nested render helpers share drawer state (`collapsedFolders`,
  `namespacesExpanded`, `openMenu`) — so a split is not warranted at this
  size; re-evaluate only if it approaches the 1000-line cap.
- **"Largest files first" sweep, remaining files clean** (2026-07) —
  `src/app/App.tsx` (664, pure wiring/bootstrap hub),
  `src/app/use-checklist-sync.ts` (640, cohesive save/retry/conflict
  state machine with strong mirror tests),
  `src/achievements/catalog.ts` (619, data registry),
  `src/ui/SyncDetailsModal.tsx` (586), `src/app/use-checklist-lists.ts`
  (558), `src/storage/useStorageBackend.ts` (557),
  `src/theme/themes.ts` (556, pure data),
  `src/storage/directory-adapter.ts` (533), and
  `src/storage/markdown/codec.ts` (529) were each read and rated 1–2:
  cohesive single concerns, well under the cap, with mirror tests where
  logic warrants them. The sweep also found **no** domain-purity
  violations (`grep -rn "from.*ui\|from.*storage\|window\|document\|fetch"
  src/domain` is clean) and **no** `as any` / `@ts-ignore` /
  `@ts-expect-error` in the surveyed files. Don't re-propose these on a
  size basis unless their line counts grow materially.
