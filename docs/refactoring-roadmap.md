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

### Severity 7–8 — multipliers

- **`useStorageBackend.ts` duplicates the encryption-wrapping decision and
  rebuilds the adapter stack at every site** — `src/storage/useStorageBackend.ts`
  (641 lines). `withEncryption(inner, { current: password })` is applied in two
  places under the *same* `encryption === "encrypted" && password !== null`
  guard: the `adapter` memo (line ~433) and the `wrapForActive` callback
  (line ~448). Cross-namespace moves then recombine `wrapForActive(makeInner(targetSlug))`
  by hand at two more sites (lines ~481 and ~515). Two copies of the
  "should this be encrypted?" decision is two chances to diverge — if the
  locked/plain/encrypted matrix ever gains a case, one site can be updated and
  the other silently wrap bytes wrong. Adding a fourth backend means touching
  the `makeInner` switch, the `settingsStore` selection, and the
  `namespaceStore` selection independently. **Plan:** extract a
  `createBackendFactory(selection)` (or a small `wrapForEncryption(raw, mode, password)`
  pure helper at minimum) into `src/storage/backend-factory.ts` so the
  encryption-wrapping decision lives in exactly one place and cross-namespace
  moves call `factory.make(targetSlug)` instead of re-threading
  `wrapForActive`+`makeInner`. The hook composes the factory once per
  `selection` change. Ship the pure `wrapForEncryption` dedupe first (small,
  unit-testable with a fake adapter) and the fuller factory as a follow-up if
  warranted. **Risk:** storage backends have **no automated coverage** — the
  three backends have different token-lifetime semantics (Dropbox refresh,
  Drive re-prompt, folder permission revocation), so the factory must expose
  the token-refresh seam rather than hide it. Smoke-test LocalStorage (default)
  plus at least one cloud backend by hand: connect, write, lock/unlock with a
  passphrase, and do a cross-namespace move with encryption on, confirming
  bytes land readable. The `wrapForEncryption` extraction alone is pure and
  directly testable. **Severity: 7.**

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

- **`App.tsx` routes drag-drop through an untestable ref-closure dispatch** —
  `src/app/App.tsx` (669 lines). The drop handler (lines ~378–402) parses a
  drag id, branches on item-kind + target-prefix, and dispatches to one of four
  mutations (`moveChecklistToFolder`, `archiveChecklist`,
  `moveChecklistToNamespace`, `moveFolderToNamespace`) inside a
  `dropHandlerRef.current` closure. The parse→branch→dispatch logic can't be
  exercised without simulating drag events, and it's not obvious the branch is
  exhaustive or that illegal drops (e.g. a folder into itself) no-op. **Plan:**
  extract a pure `resolveDragDrop(itemId, targetKey, state): DragDropAction`
  into `src/app/drag-drop-resolver.ts` that returns a discriminated action
  object; the ref handler becomes a thin dispatch loop, and the resolver is
  unit-testable with no React/DOM. The action type documents which drop targets
  are legal. **Risk:** currently untested precisely because drag-drop is hard to
  simulate — the extraction *creates* the testable seam, so land the resolver's
  tests in the same PR. Confirm illegal-target cases resolve to a no-op action.
  **Severity: 5.**

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

_None yet — roadmap reset to a clean slate (2026-06)._

## Investigated and skipped

_None yet — roadmap reset to a clean slate (2026-06)._
