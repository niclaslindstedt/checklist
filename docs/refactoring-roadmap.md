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

_None pending._

### Severity 3–4 — nits with leverage

_None pending._

### Easy wins

_None pending._

## Landed

- **Extracted the GIS OAuth plumbing into `gdrive/gis-oauth.ts`**
  (2026-06) — lifted the GIS token-client flow (`loadGisScript`,
  `startGdriveAuth`, `preloadGdriveAuth`, the `gisLoaderPromise` script
  cache, the GIS type declarations, and the `GDRIVE_SCOPE` constant) out of
  `src/storage/gdrive/index.ts` into a new
  `src/storage/gdrive/gis-oauth.ts`. The new module imports only
  `GOOGLE_CLIENT_ID` from `index.ts` (a one-directional edge — no cycle:
  `index.ts` no longer references any OAuth symbol), and `useCloudTokens`
  now imports `startGdriveAuth` from the new module. `index.ts` dropped
  630 → 498 lines; the OAuth module is 142. The extraction made the popup
  flow directly unit-testable for the first time — the previously
  zero-coverage flow is now exercised at 85% lines in the new
  `tests/storage/gdrive-oauth.test.ts` (success grant, error response,
  missing token, error-callback paths, and the `<script>`-injection path
  via a stubbed `window.google`). No behaviour change; the file-I/O paths
  (list / read / write / remove / `deleteGdriveNamespace`) and the logger
  channel name (`"gdrive"`) were untouched, so the GIS popup hot path did
  not need a manual smoke test for this pure relocation.

- **Extracted the sidebar drag-to-move plumbing into a `useSideMenuDrag`
  hook** (2026-06) — moved the `draggingChecklist` / `dropTarget` state, the
  drag-abort reset effect, and the `startChecklistDrag` / `endChecklistDrag` /
  `allowDropOn` / `commitDrop` handlers out of `src/ui/SideMenu.tsx` into
  `src/ui/hooks/useSideMenuDrag.ts`. The decision logic the handlers shared
  (`deriveDragKind`, `dropAcceptsKind`, `isKeyDropTarget`) came out as pure,
  exported functions, directly unit-tested with no DOM; the stateful handlers
  are driven through `renderHook` in `tests/ui/hooks/use-side-menu-drag.test.tsx`
  (100% lines/funcs on the hook). `SideMenu` dropped 797 → 726 lines and now
  consumes a six-member bag. Two deviations from the original plan: the touch
  `onDragLeave` handlers needed a `clearDropTarget()` member (the old code
  reached for `setDropTarget(null)` inline), and the hook reads the drag
  contexts internally rather than returning `dragKind` / `acceptsDrag` — those
  stay private, so the public surface is narrower than the plan listed. The
  existing `side-menu-drag-highlight.test.tsx` integration coverage stays green.
- **Extracted the `RetryScheduler` cooldown machine out of
  `use-checklist-sync.ts`** (2026-06) — step 2 of 2 of the sync-engine split,
  completing it. Moved the `retryTimer` / `consecutiveThrottles` /
  `transientRetries` refs, the `armResave` generation-guarded cooldown, and
  the throttle-floor-escalate / next-transient-delay arithmetic into a pure,
  framework-free `src/app/retry-scheduler.ts` (`RetryScheduler`), composing
  the existing `SaveQueue` for the requeue + generation read. Directly
  unit-tested at 100% in `tests/app/retry-scheduler.test.ts` (generation
  guard, arm-coalescing, throttle escalation, transient budget); the hook
  composes it and dropped from 689 → 640 lines. The hook's existing
  behavioural tests (throttle-recovery, transient-retry-then-error, offline
  gentle-resume, saveNow-after-error) stay green.
- **Extracted the `SaveQueue` state machine out of `use-checklist-sync.ts`**
  (2026-06) — step 1 of 2 of the sync-engine split. Moved the `pendingDoc` /
  `inFlight` / `saveGeneration` refs and the serialized-save invariants
  (single in-flight write, newest-snapshot-wins coalescing, stale-generation
  guard) into a pure, framework-free `src/app/save-queue.ts`, unit-tested at
  100% in `tests/app/save-queue.test.ts`. The hook composes it; the
  retry-scheduler seam (step 2) remains in Pending.

## Investigated and skipped

_None yet — roadmap reset to a clean slate (2026-06)._
