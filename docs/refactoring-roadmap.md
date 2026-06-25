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

### Severity 3–4 — nits with leverage

_None pending._

### Easy wins

_None pending._

## Landed

- **`useStorageBackend.ts` three `selection.kind` builders consolidated into
  `createBackendFactory`** (2026-06) — the `makeInner`, `settingsStore`, and
  `namespaceStore` switches (each re-deriving the same per-backend branch) now
  live as one switch with a single case per backend in
  `createBackendFactory(selection, { fetchImpl, storage, onFolderPermissionLost })`
  (`src/storage/backend-factory.ts`), returning `{ makeInner, settingsStore,
  namespaceStore }`. Adding a backend is one new case, not three switches kept
  in lockstep. The hook composes the factory once per `selection` change and
  reads the three off it; behaviour and the Dropbox token-refresh seam
  (`auth.onAccessTokenRefreshed`) are unchanged. The `fetch` / `localStorage`
  globals are now injected, so the previously-unreachable dispatch is unit-tested
  per backend (browser/dropbox/gdrive/folder) in
  `tests/storage/backend-factory.test.ts` — 100% of the new factory. Pure
  refactor; full suite (1085 tests) green. **Cloud OAuth flows have no automated
  coverage — smoke-tested LocalStorage + a cloud backend (connect, write, switch
  namespace) by hand before merge.** Was Severity 4.

- **`FolderRow` split into desktop / touch variants** (2026-06) — the single
  `FolderRow` in `src/ui/SideMenuRows.tsx` that branched on `desktop` (and so
  mounted `useSwipeReveal` even on the desktop path that never uses it) is now
  `FolderRowDesktop` / `FolderRowTouch`, dispatched by a thin `FolderRow` on the
  `desktop` flag and sharing one `FolderRowHeader`. The swipe hook no longer
  fires on desktop, and the desktop right-click context menu — previously
  untested (jsdom has no `matchMedia`, so `SideMenu` renders touch-only) — is now
  directly covered alongside the touch strip in `tests/ui/side-menu-rows.test.tsx`
  (8 cases). Pure presentational relocation, no behaviour change. Was Severity 3.

- **`ChecklistView.tsx` composer modes consolidated into a `useComposer` hook**
  (2026-06) — replaced the three parallel composer states (`drafting`,
  `childDraftParentId`, `afterDraftAnchorId`), their per-mode verb callbacks,
  and the four depth/index memos with a single discriminated `ComposerState`
  (`none | inline | child | after`) owned by `src/ui/hooks/useComposer.ts`
  (218 lines). The hook derives the one active composer's splice index, depth,
  and verbs in one place; ChecklistView keeps only display wiring and dropped
  from 631 to 486 lines. Pure refactor, no behaviour change — the 41 existing
  ChecklistView integration tests still pass, and the hook's previously-embedded
  index/depth math and anchor-chaining are now directly unit-tested in
  `tests/ui/hooks/use-composer.test.ts` (12 cases, ~91% of the new file). Was
  Severity 6.

- **`SyncLogPanel` extracted out of `SyncDetailsModal.tsx`** (2026-06) — moved
  the developer sync-log sub-component, its `SYNC_LOG_SCOPES` filter, and the
  `formatLogTime`/`formatLogLine`/`levelClass`/`railClass` helpers to
  `src/ui/SyncLogPanel.tsx`, shrinking the near-cap modal from 737 to 586
  lines. Pure presentational relocation, no behaviour change; the modal imports
  the panel and is otherwise untouched. The extraction exposed the panel as a
  directly-testable export, so `tests/ui/sync-log-panel.test.tsx` adds focused
  coverage the modal tests lacked — the scope filter (drops out-of-scope noise)
  and the clipboard copy (chronological order, success/failure labels) — taking
  the new file to 100% branch/line coverage. Was Severity 4 (easy win).

- **`useStorageBackend.ts` encryption-wrapping decision deduped into a pure
  helper** (2026-06) — pulled the twice-written
  `encryption === "encrypted" && password !== null ? withEncryption(…) : raw`
  decision (the `adapter` memo and the `wrapForActive` callback) into
  `wrapForEncryption(raw, mode, password)` in `src/storage/backend-factory.ts`,
  so the locked/plaintext/encrypted matrix lives in one place instead of two
  that could diverge. Unit-tested across all three branches in
  `tests/storage/backend-factory.test.ts` with a fake in-memory adapter —
  coverage the inline expressions never had. The fuller `createBackendFactory`
  consolidation of the three `selection.kind` builders is split out as a
  narrower Severity-4 follow-up in Pending. Was Severity 7.

- **`App.tsx` drag-drop dispatch extracted to a pure resolver** (2026-06) —
  pulled the parse→branch→dispatch logic out of the `dropHandlerRef` closure
  into `resolveDragDrop(rawId, key): DragDropAction` in
  `src/app/drag-drop-resolver.ts`. The ref handler is now a thin `switch` over
  the discriminated action; the drop-target matrix (including the
  illegal-folder-drop no-ops) is unit-tested in
  `tests/app/drag-drop-resolver.test.ts` with no React/DOM, coverage the
  closure never had. Was Severity 5.

## Investigated and skipped

_None yet — roadmap reset to a clean slate (2026-06)._
