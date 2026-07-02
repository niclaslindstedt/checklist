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

- **`src/domain/checklists.ts` (905 lines) — split the domain grab-bag before
  it breaches the 1000-line cap.** The file is pure and well-tested but has
  grown to 32 exported functions spanning five distinct concerns: tree
  helpers (`flattenItems`, `findItem`, `withChildren`, `updateItem`,
  `removeItem`, `mapTree`, ~lines 25–135), checklist-level CRUD/metadata
  (`createChecklist`, `renameChecklist`, `setChecklistAppearance`,
  `setChecklistArchived`, `nextChecklistName`, ~137–280), item operations
  (`addItem*`, `editItem`, `deleteItem`, `toggleItem`, `setAllChecked`,
  ~281–711), archive operations (`archiveChecked`, `deleteChecked`,
  `setArchived`, `activeItems`, `archivedItems`, `archivedByChecklist`,
  ~484–611), and move/reorder/display transforms (`moveItem`,
  `moveItemInto`, `insertRelative`, `sortCheckedToBottom`, `displayItems`,
  `moveDisplayedItem`, `flattenForDisplay`, `progress`, ~612–905). At 95
  lines of headroom under the CI-enforced cap (§20.5), the next few domain
  features force either a rushed split or an unjustified
  `allow-large-file` opt-out. **Plan:** split by the five concerns above
  into sibling modules (e.g. `item-tree.ts`, `checklist-ops.ts`,
  `item-ops.ts`, `archive-ops.ts`, `item-display.ts`); keep
  `checklists.ts` as a barrel re-export so the 10 importing files stay
  untouched, then split `tests/domain/checklists.test.ts` to mirror. Ship
  as two PRs if the diff exceeds ~500 lines (item ops first, display
  second). **Risk:** low — pure functions, no DOM/I/O, full mirror test
  coverage pins behaviour; the barrel keeps the public API byte-identical.
  Verify coverage per new file doesn't drop. **Severity: 5.**

### Severity 3–4 — nits with leverage

- **`src/ui/SideMenuRows.tsx` (732 lines) — extract the folder-row family
  into `SideMenuFolderRow.tsx`.** The file mixes generic drawer building
  blocks (`SectionHeader`, `NavItem`, `SwipeToRemove`, `MenuButton`,
  `MenuLink`, ~lines 38–301) with the folder-specific composite
  (`FolderRowHeader`, `FolderRowDesktop`, `FolderRowTouch`, `FolderRow`,
  `FolderEditRow`, ~lines 391–666). The two variants also each render
  `<FolderRowHeader …>` with an identical prop set (lines 498–505 and
  578–585), so any header prop change must be made twice. **Plan:** move
  the five folder components to `src/ui/SideMenuFolderRow.tsx` (~275
  lines, leaving `SideMenuRows.tsx` at ~460), and have the variants share
  the header element (built once in the thin `FolderRow` dispatcher or a
  local helper) so the prop set lives in one place. Re-point the folder
  cases in `tests/ui/side-menu-rows.test.tsx` to the new module in the
  same PR. **Risk:** very low — pure presentational relocation with
  existing test coverage of both desktop (context menu) and touch (swipe
  strip) paths; smoke-check folder expand/collapse, rename, delete in the
  drawer. **Severity: 4.**

### Easy wins

- The `SideMenuRows.tsx` folder-row extraction above is mechanical
  (component relocation plus a test re-point) and qualifies as an easy win.
- **`src/app/App.tsx:458` — the repo's only lint warning
  (`react-hooks/exhaustive-deps`).** The sync-status `useMemo` lists
  `checklist.reload` in its dependency array but the closure reads it as
  `() => void checklist.reload()`, so eslint demands the whole `checklist`
  object. The listed field-level deps make the memo behave correctly
  today, but the warning defeats the "zero-warning linter" claim in
  `AGENTS.md` and trains readers to ignore lint output. **Plan:**
  destructure `const { reload } = checklist` (or reference a
  pre-captured callback) so the closure's dependency matches the array;
  no dependency-array change, no behaviour change. **Risk:** none —
  verify the memo still recreates on the same transitions
  (`tests/` sync-status coverage plus `make lint` going to zero
  warnings). **Severity: 3.**

## Landed

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
