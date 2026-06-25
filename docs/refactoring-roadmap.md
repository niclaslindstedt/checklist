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

### Severity 5–6 — friction

- **`ChecklistView.tsx` interleaves three composer modes through parallel
  state and callback sets** — `src/ui/ChecklistView.tsx` (631 lines). Three
  add-item affordances (inline add `drafting`, child form `childDraftParentId`,
  after-item form `afterDraftAnchorId`) each carry their own state, their own
  `addItem`/`importItems`-style verb callbacks (lines ~329–377), and their own
  depth/index memos (`childDraftDepth`/`childDraftIndex` ~384–398,
  `afterDraftDepth`/`afterDraftIndex` ~404+), with mutual-exclusion close logic
  scattered across the component. A reader has to hold three parallel patterns
  in their head to follow which composer is active. **Plan:** extract a
  `useComposer()` hook (`src/ui/hooks/useComposer.ts`) owning a single
  discriminated state (`{ kind: 'none' | 'inline' | 'child' | 'after';
  parentId?; anchorId? }`), the derived depth/index as one memo, the verb
  factories bound to the active kind, and the mutual-exclusion close logic.
  ChecklistView keeps only display wiring. **Risk:** the three composers differ
  in depth positioning and anchor chaining (the Shift+Enter "add after" chain);
  pin the current behaviour with a test first, then refactor under it. No
  storage/domain impact. **Severity: 6.**

### Severity 3–4 — nits with leverage

- **`SideMenuRows.tsx` duplicates the `FolderRow` header/action JSX across
  desktop and touch branches** — `src/ui/SideMenuRows.tsx` (662 lines).
  `FolderRow` renders a different tree for desktop (right-click context menu,
  lines ~450–532) vs. touch (`useSwipeReveal` strip), re-implementing the
  header and trash/edit action strip twice; the swipe hook also fires in a
  test/desktop environment, making the presentational rows awkward to unit-test
  without touch. **Plan:** split into `FolderRowDesktop` / `FolderRowTouch`
  picked by the `desktop` flag already available at the call site (line ~352),
  sharing the header via a small helper so the action strip isn't written
  twice. **Risk:** purely presentational; verify both the desktop context-menu
  and the touch swipe-to-remove gestures still fire after the split. **Severity: 3.**

- **`useStorageBackend.ts` re-derives the active selection across three
  parallel `switch (selection.kind)` builders** — `src/storage/useStorageBackend.ts`
  (637 lines). `makeInner` (line ~317), `settingsStore` (line ~363), and
  `namespaceStore` (line ~384) each switch over the same `BackendSelection`
  to build the document adapter, the root settings store, and the namespace
  registry store respectively. Adding a fourth backend means filling in three
  separate switches in lockstep; missing one is a silent gap. This is the
  *remaining* half of the now-landed encryption-wrapping dedupe (the duplicate
  "should this be encrypted?" decision is fixed; these three structural
  switches are the lower-leverage residue). **Plan:** introduce a
  `createBackendFactory(selection)` in `src/storage/backend-factory.ts`
  exposing `{ makeInner(slug), settingsStore, namespaceStore }` so one place
  knows how to build every per-backend store from a selection; the hook
  composes it once per `selection` change. **Risk:** storage backends have
  **no automated coverage** and the cloud builders take live tokens — smoke-test
  LocalStorage plus one cloud backend (connect, write, switch namespace) by
  hand before merging; the factory must keep the token-refresh seam exposed,
  not hidden. **Severity: 4.**

### Easy wins

- **Extract the inline `SyncLogPanel` out of `SyncDetailsModal.tsx`** —
  `src/ui/SyncDetailsModal.tsx` (737 lines, nearing the 1000-line cap). The
  developer sync-log panel (lines ~621–703) is a self-contained sub-component
  with its own `version`/`copyStatus` state, an async `handleCopy`, the
  `SYNC_LOG_SCOPES` const, and the `formatLogTime`/`formatLogLine`/`levelClass`/
  `railClass` formatting helpers — orthogonal to the modal's main job (surface
  sync status + reconnect buttons). **Plan:** move `SyncLogPanel` and its
  helpers to `src/ui/SyncLogPanel.tsx` (~100 lines); props reduce to roughly
  `{ t }`. Pure presentational relocation, no behaviour change, shrinks the
  near-cap modal by ~80 lines and makes the panel reusable. **Risk:** none
  beyond confirming the copy button and log rendering still work. **Severity: 4.**

## Landed

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
