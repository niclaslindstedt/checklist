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

- **Extract the Google Identity Services OAuth plumbing out of
  `gdrive/index.ts`.** `src/storage/gdrive/index.ts` (630 lines) tangles three
  unrelated concerns: the GIS OAuth flow (`loadGisScript`, `startGdriveAuth`,
  `preloadGdriveAuth`, the token-client promise cache and `<script>`
  injection, lines ~546–630), the file-store adapter factory (lines ~146–180),
  and namespace deletion (`deleteGdriveNamespace`, lines ~452–501). The three
  don't interact beyond the adapter handing a token in. Re-verify with `grep -n
  "loadGisScript\|startGdriveAuth\|preloadGdriveAuth\|gisLoaderPromise"
  src/storage/gdrive/index.ts`.
  - **Plan**: lift the GIS machinery into `src/storage/gdrive/gis-oauth.ts`,
    exporting only `startGdriveAuth` + `preloadGdriveAuth` (keep the script
    cache and token-client types private). `createGdriveAdapter` calls
    `startGdriveAuth`, gets a token, hands it to the file store — the file
    store stays as-is (it's crisp). The OAuth module becomes independently
    unit-testable, and the next cloud backend has a pattern to copy rather than
    re-derive.
  - **Risk**: low — OAuth is self-contained and the file-I/O paths (list /
    read / write / remove / `deleteGdriveNamespace`) don't move. But the GIS
    popup + token-refresh flow has **no automated coverage**, so the extraction
    must be smoke-tested by hand: connect Google Drive, confirm the popup
    completes, a token is obtained, and a save round-trips. **Severity: 5.**

### Severity 3–4 — nits with leverage

_None pending._

### Easy wins

_None pending._

## Landed

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
