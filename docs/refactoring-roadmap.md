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

_None pending._

### Severity 5–6 — friction

_None pending._

### Severity 3–4 — nits with leverage

_None pending._

### Easy wins

_None pending._

## Landed

- **Lifted the logged-fetch diagnostics block into a shared `createRequestLog`**
  (2026-06). The surrounding logging *block* both cloud adapters wrote out
  inline — `performance.now()` start + `elapsed()`, the `try { … } catch` that
  warns with `describeError` and rethrows, and the closing `→ status (ms)`
  info/warn line — now lives in one `createRequestLog(log, url, labelOverride?)`
  in `src/storage/http-utils.ts` returning a `{ attempt, logStatus }` handle.
  gdrive's `createLoggedFetch` is now `attempt(() => fetchImpl(url, init))` →
  `logStatus(res)`; Dropbox's `authedFetch` composes the same two primitives
  with its 401 silent-refresh retry interleaved (`attempt(…, " (post-refresh)")`
  for the second try) instead of threading a retry callback through a single
  wrapper — a cleaner seam than the roadmap's "post-throw retry callback" plan,
  since the retry fires on a 401 *status*, not a throw. The shared `Logger` is
  passed in (each adapter keeps its own `gdrive` / `dropbox` scope). Both
  adapters dropped their now-unused `describeError` / `requestLabel` imports.
  Added 7 direct unit tests against a mocked `Logger`
  (`tests/storage/http-utils.test.ts`: success passthrough, throw-logs-and-
  rethrows with and without a note, info-on-ok / warn-on-non-ok status lines,
  caller label override) the buried inline block couldn't have. Pure
  relocation, no behaviour change — the gdrive / dropbox adapter suites
  (incl. the Dropbox 401-refresh regressions) pass unchanged; full suite
  (965 tests) green. With this the cloud-adapter logged-fetch duplication is
  fully resolved and **Pending is empty.**

- **Collapsed the cross-namespace move verbs onto one `writeMovedDocument`
  helper** (2026-06). Seventh and final seam of the `useStorageBackend.ts`
  god-hook split: the near-duplicated best-effort target-write shape that both
  `moveChecklistToNamespace` and `moveFolderToNamespace` wrote out inline
  (`load().catch(() => null)` → `parse` → mutate → `save(serialize(doc),
  prev?.revision)` in a `try/catch` returning `false`) now lives in one pure
  `src/storage/namespace-moves.ts` (`writeMovedDocument(target, transform)`,
  39 lines) returning a `{ ok } | { ok, error }` result so each verb keeps its
  own success / failure log line. The verbs now build only the document
  transform (drop-folder + prepend for a checklist; prepend-group + `addFolder`
  for a folder) and own the guards and logging. Added direct unit tests
  (`tests/storage/namespace-moves.test.ts`, 4 cases against a mock adapter:
  save+ok, load-failure→empty-document, revision threaded back to `save`, and
  the **save-failure→`{ ok: false, error }`** path the hook tests can't reach
  on the browser backend, which never throws). Pure relocation, no behaviour
  change — the existing through-the-hook move tests pass unchanged; full suite
  (959 tests) green. Shrank `useStorageBackend.ts` 642 → 641 lines (the win is
  the shared, now-testable write shape and the single edit point for a fourth
  backend's move path, not shrinkage). With every lifecycle and the move verbs
  peeled out, the god-hook smell has fully decayed — see Investigated and
  skipped.

- **Extracted the cloud token state into `useCloudTokens`** (2026-06).
  Sixth seam of the `useStorageBackend.ts` god-hook split: moved the
  `dropboxToken` / `dropboxRefresh` / `gdriveToken` state, the Dropbox OAuth
  boot-redirect completion effect (and its `cleanAuthParamsFromUrl` helper),
  and the `connectDropbox` / `disconnectDropbox` / `connectGdrive` /
  `disconnectGdrive` verbs into a new `src/storage/useCloudTokens.ts` (174
  lines) exposing `{dropboxToken, dropboxRefresh, gdriveToken,
  onDropboxAccessTokenRefreshed, connectDropbox, disconnectDropbox,
  connectGdrive, disconnectGdrive}`. The hook takes `switchToBackend` as an
  argument exactly as `useFolderHandle` does — no latest-ref entanglement,
  since the connect verbs need nothing built downstream of the tokens. The
  parent's `selection` memo now reads the three tokens and threads the
  silently-refreshed Dropbox access token back through the hook's
  `onDropboxAccessTokenRefreshed` callback; `removeNamespace` and the
  `dropboxConnected` / `gdriveConnected` flags read the exposed tokens. The
  `cloudWalker` achievement unlock travelled inline with the boot effect and
  `connectGdrive` (the catalog test's static `unlock("<id>")` scan covers all
  of `src/`, so it stays wired). Added direct unit tests
  (`tests/storage/use-cloud-tokens.test.ts`, 12 cases against the mocked
  Dropbox / Gdrive auth modules + the real token store: boot rehydrate,
  OAuth completion with / without a refresh token / no pending auth / no
  code / failed exchange / URL scrub, refresh-token reflect, connect /
  disconnect for both backends — 98.21% line, 100% func, 78.57% branch on the
  new module) the buried OAuth flow couldn't have. Shrank
  `useStorageBackend.ts` 734 → 642 lines. Pure relocation, no behaviour
  change; full suite (955 tests) green. The god-hook smell has largely
  decayed — the file is back under the friction band; the next recommended
  seam (the cross-namespace move verbs) is re-rated Severity 4.

- **Extracted the folder lifecycle into `useFolderHandle`** (2026-06).
  Fifth seam of the `useStorageBackend.ts` god-hook split: moved the
  `folderHandle` / `folderHandleLoaded` / `folderReconnectNeeded` state, the
  IndexedDB boot probe, `markFolderPermissionLost`, and the
  `connectFolder` / `reconnectFolder` / `disconnectFolder` verbs into a new
  `src/storage/useFolderHandle.ts` (215 lines) exposing
  `{folderHandle, folderHandleLoaded, folderReconnectNeeded,
  markFolderPermissionLost, connectFolder, reconnectFolder,
  disconnectFolder}`. The connect / disconnect verbs read the active
  document (to seed an empty folder and to mirror back on disconnect), which
  lives *downstream* of the folder handle (the active adapter is selected
  from the handle) — a genuine ordering cycle, since `markFolderPermissionLost`
  is needed *upstream* by the adapter builders. Broke it with a `runtime`
  latest-ref the parent refreshes each render (the same idiom
  `usePullToRefresh` uses for `onRefresh`), so the whole concern stays in one
  cohesive hook. The `localVault` achievement unlock travelled inline with
  `connectFolder` (the catalog test's static `unlock("<id>")` scan covers all
  of `src/`, so it stays wired). Added direct unit tests
  (`tests/storage/use-folder-handle.test.ts`, 12 cases against a mocked
  handle-store + picker: boot-probe rehydrate / lapsed-grant / no-handle,
  connect-seed / adopt / abort / unsupported, reconnect re-grant / fall back
  to connect, disconnect mirror-to-browser — 91.66% line, 80% branch on the
  new module) the buried File-System-Access flow couldn't have. Shrank
  `useStorageBackend.ts` 846 → 734 lines. Pure relocation, no behaviour
  change; full suite (943 tests) green. Recommended next seam is the **cloud
  token state** (see the Pending row).

- **Extracted the encryption lifecycle into `useEncryption`** (2026-06).
  Fourth seam of the `useStorageBackend.ts` god-hook split: moved the
  `encryption` mode + session-`password` state, the derived `locked` gate,
  and the `enableEncryption` / `disableEncryption` / `unlock` verbs (the
  crypto re-wrap / decrypt / verify round-trips) into a new
  `src/storage/useEncryption.ts` (182 lines) exposing
  `{encryption, password, locked, enableEncryption, disableEncryption,
  unlock}` and driven by the unwrapped scoped `inner` adapter. The
  `EncryptionProgress` / `EncryptionProgressStep` types moved with it and are
  re-exported from `useStorageBackend.ts` so the unlock gate, the storage
  settings tab, the progress-message map, and their tests keep resolving them
  from the old module. The `paranoidMode` achievement unlock travelled inline
  with `enableEncryption` (the catalog test's static `unlock("<id>")` scan
  covers all of `src/`, so it stays wired). Added direct unit tests
  (`tests/storage/use-encryption.test.ts`, 12 cases against a mocked adapter:
  enable→envelope, disable→plaintext, unlock right/wrong/offline/plaintext-
  at-rest, progress phases — 100% line/func, 90% branch on the new module)
  the buried verbs couldn't have. Shrank `useStorageBackend.ts` 934 → 846
  lines. Pure relocation, no behaviour change; full suite (931 tests) green.
  Recommended next seam is the **folder lifecycle** (see the Pending row).

- **Routed the connect-side persist→select pair through `switchToBackend`**
  (2026-06). Second consolidation seam of the `useStorageBackend.ts`
  god-hook: the `persistBackend(id)` + `setBackendState(id)` pair that was
  written out inline at five sites (`selectBrowser`, `switchToBrowser`,
  `connectFolder`, `connectGdrive`, and the Dropbox OAuth boot effect) now
  lives in one `switchToBackend(id)` primitive they all call. The
  feature-specific `unlockAchievement("…")` lines stay inline at each
  connect site so the catalog test's static `unlock("<id>")` scan still
  proves every manual achievement is wired (burying the id in
  `switchToBackend`'s argument would have silently broken that guard — the
  test caught it). `persistBackend` / `setBackendState` now have exactly one
  call site each. Net line count ~flat (+6) — the win is the single edit
  point for a fourth backend's switch, not shrinkage. Pure relocation, no
  behaviour change; full suite (919 tests) green.

- **Consolidated the per-backend `disconnect*` clear→reset→switch shape**
  (2026-06). The shared switch-to-browser tail (`persistBackend("browser")`
  + `setBackendState("browser")`) now lives in one `switchToBrowser()`
  callback that all three `disconnect*` callbacks route through, and the
  Dropbox access/refresh pair clears via a new pure `clearDropboxTokens()`
  in `backend-preference.ts` (clearing one without the other left a
  half-authenticated state) with a direct unit test. A fourth backend's
  disconnect is now clear-its-state + `switchToBrowser()`, not a re-typed
  pair. Net line count on the hook is ~flat (+4) — the win is
  de-duplication, not shrinkage. Pure relocation, no behaviour change; full
  suite (911 tests, incl. the settings-modal disconnect tests) green.
  Narrower than the god-hook row implied; recommended next seam is the
  symmetric *connect* side (see the row above).

- **Extracted the phantom-conflict resolver into `phantom-conflict.ts`**
  (2026-06). Lifted the fingerprint / order-independent `comparable`
  canonical form and the adopt / overwrite / conflict verdict out of
  `directory-adapter.ts`'s `save()` closure into a new pure
  `src/storage/phantom-conflict.ts` (`fingerprint`, `comparable`,
  `resolvePhantomConflict`), and added direct unit tests
  (`tests/storage/phantom-conflict.test.ts`, 100% line / func, 91.66%
  branch on the new module) the buried code couldn't have. The adapter
  keeps the I/O and the persisted write log and delegates the verdict; the
  encrypted-envelope conflict (no fingerprint) stays inline so its log line
  reads correctly. Pure relocation, no behaviour change — the full
  directory-adapter suite (incl. all phantom-conflict regressions) passes
  unchanged. Shrank `directory-adapter.ts` 533 → ~490 lines.

- **Extracted the namespace registry into `useNamespaceRegistry`**
  (2026-06). First seam of the `useStorageBackend.ts` god-hook split:
  moved the `namespaces` state, the best-effort `namespaces.json` push,
  the boot-time reconcile effect, and the four CRUD verbs' shared
  `registryOp → setState → push` dance into a new
  `src/storage/useNamespaceRegistry.ts` (154 lines) exposing
  `{namespaces, add, rename, setAppearance, remove}`. The hook's wrappers
  in `useStorageBackend` keep the backend-specific side concerns (data
  deletion on remove, active-namespace switching, achievements). Shrank
  `useStorageBackend.ts` 933 → 866 lines and added direct unit tests
  (`tests/storage/use-namespace-registry.test.ts`, ~97% line coverage on
  the new hook) the buried code couldn't have. Pure relocation, no shape
  change; smoke-test against LocalStorage clean.

- **Shared `requestLabel` / `describeError` across the cloud adapters**
  (2026-06). Moved the two byte-for-byte-identical HTTP-diagnostics helpers
  out of `src/storage/gdrive/index.ts` and `src/storage/dropbox/index.ts`
  into `src/storage/http-utils.ts` and imported them from both; added unit
  tests (now 100% coverage on `http-utils.ts`). The surrounding
  logged-fetch block is left as a narrower Severity-3 follow-up in Pending.

- **Shared `bearerAuthHeader(token)` helper across the cloud adapters**
  (2026-06). Replaced the seven hand-built `Authorization: Bearer ${token}`
  strings (gdrive `authHeader()` + namespace-delete, five Dropbox request
  sites) with one `bearerAuthHeader()` in `src/storage/http-utils.ts`,
  spread into each `headers` object; added unit tests. Guards against a
  header-casing typo and gives a single edit point for a future scheme
  change.

## Investigated and skipped

- **`useStorageBackend.ts` god-hook split — remaining composition core**
  (skipped 2026-06). The seven-PR concern split is done: namespace registry,
  disconnect shape, connect shape, encryption, folder, cloud-token, and
  cross-namespace-move seams all live in their own modules (see Landed). What
  remains in the hook (641 lines, comfortably under the 1000-line cap) is the
  **irreducible adapter composition** — the `selection` memo, `makeInner` /
  `inner`, the per-backend `settingsStore` / `namespaceStore`, and the active
  `adapter` — i.e. selecting the live `StorageAdapter` from the backend
  preference + tokens + encryption. That is the hook's whole reason to exist;
  it isn't a separable "concern" so much as the wiring the extracted hooks plug
  into, and pulling it apart would trade a cohesive core for ceremony. The
  god-hook smell has decayed to cosmetic. **Was Severity 4 → re-rated 2.**
  Re-evaluate only if the file grows back toward the cap.

- **Centralise `splitPath` across the file backends** (skipped 2026-06).
  The roadmap claimed N≥3 call sites of the
  `path.split("/").filter((s) => s.length > 0)` idiom, but on re-verify
  only **two** remain (`src/storage/gdrive/index.ts` ~457 and
  `src/storage/folder/index.ts` ~92) — the claimed inline Dropbox site
  isn't there. A shared module + test for a one-line idiom at two trivial
  call sites is below the easy-win N≥3 threshold and the fix threshold.
  Re-evaluate if a third file grows the same idiom. **Was Severity 4 →
  re-rated 2.**
