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

- **Extract the retry-scheduler concern out of `use-checklist-sync.ts`**
  (step 2 of 2 — step 1, the `SaveQueue` extraction, landed 2026-06).
  `src/app/use-checklist-sync.ts` (689 lines) still keeps the **retry
  scheduler** inline: `retryTimer` / `consecutiveThrottles` /
  `transientRetries` refs, `armResave` (the generation-checked cooldown,
  lines ~224–238) and the cooldown/backoff arithmetic scattered through
  `performSave`'s `catch` (the throttle-floor escalation and transient-retry
  branches, lines ~325–360) and the three cancel-and-reset sites (backend
  swap, reload, unmount). Re-verify with `grep -n
  "retryTimer\|consecutiveThrottles\|transientRetries\|armResave"
  src/app/use-checklist-sync.ts`.
  - **Plan**: the save-queue state machine is now a tested unit
    (`src/app/save-queue.ts`, `SaveQueue` — owns `pendingDoc` / `inFlight` /
    `saveGeneration`, the coalescing, and the generation guard); the error
    *predicates* are already extracted (`isOfflineError`,
    `describeStorageError` in `src/storage/cache/`; `isRetryableSaveError`,
    `backoffDelayMs`, `MAX_TRANSIENT_SAVE_RETRIES`, `OFFLINE_RESUME_MS` in
    `src/storage/save-retry.ts`) — so do **not** re-extract an
    "ErrorClassifier". The genuine remaining seam is a `RetryScheduler` that
    owns `retryTimer` / `consecutiveThrottles` / `transientRetries`, an
    `arm(callback, waitMs)` that captures and re-checks the `SaveQueue`
    generation, a `cancel()`, and the counter helpers (throttle floor +
    escalate, next transient delay, reset on success / swap). It composes the
    existing `SaveQueue` for the requeue + generation read. Unit-test the
    cooldown's generation guard and the throttle escalation directly, then
    have `useChecklistSync` compose it. One PR; leaves the hook working and
    shrinking.
  - **Risk**: high blast radius — every backend's save path threads through
    this hook, and the cloud OAuth flows (Google Drive, Dropbox) have **no
    automated coverage**. The throttle/transient cooldown is
    correctness-critical (a regression can hammer a rate-limited backend or
    drop a queued retry). The hook's behaviour is well-pinned by
    `tests/app/use-checklist-sync.test.ts` (throttle-recovery,
    transient-retry-then-error, offline gentle-resume, saveNow-after-error);
    refactor under those, then manually smoke-test throttle+transient-retry
    and offline→reconnect against LocalStorage plus at least one cloud
    backend. **Severity: 7.**

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

- **Extract the sidebar drag-and-drop plumbing into a `useSideMenuDrag`
  hook.** `src/ui/SideMenu.tsx` (797 lines) mingles drag-and-drop coordination
  (`startChecklistDrag` / `endChecklistDrag` / `allowDropOn` / `commitDrop`,
  the `draggingChecklist` / `dropTarget` state, and the derived `dragKind` /
  `acceptsDrag` / `isDropTarget`, lines ~209–274) with the high-level folder /
  checklist render path (lines ~315–445). The two share no cohesion beyond
  "both live in the sidebar". Re-verify with `grep -n
  "startChecklistDrag\|commitDrop\|draggingChecklist\|dropTarget\|acceptsDrag"
  src/ui/SideMenu.tsx`.
  - **Plan**: pull the drag state + handlers + derived flags into a
    `useSideMenuDrag` hook (under `src/ui/hooks/`), returning
    `{ draggingChecklist, dropTarget, startChecklistDrag, endChecklistDrag,
    allowDropOn, commitDrop, dragKind, acceptsDrag, isDropTarget }`. `SideMenu`
    threads the derived flags into the row / folder renders as it does today,
    ~150 lines shorter. The hook is pure local state, directly testable.
  - **Risk**: low — no external contract changes; the hook is local state +
    handlers. Verify folder / checklist rows still accept drops and that the
    mobile long-press touch-drag still routes through the drag context.
    **Severity: 4.**

### Easy wins

_None pending._

## Landed

- **Extracted the `SaveQueue` state machine out of `use-checklist-sync.ts`**
  (2026-06) — step 1 of 2 of the sync-engine split. Moved the `pendingDoc` /
  `inFlight` / `saveGeneration` refs and the serialized-save invariants
  (single in-flight write, newest-snapshot-wins coalescing, stale-generation
  guard) into a pure, framework-free `src/app/save-queue.ts`, unit-tested at
  100% in `tests/app/save-queue.test.ts`. The hook composes it; the
  retry-scheduler seam (step 2) remains in Pending.

## Investigated and skipped

_None yet — roadmap reset to a clean slate (2026-06)._
