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

- **`useStorageBackend.ts` is an 866-line god-hook nearing the 1000-line
  cap.** `src/storage/useStorageBackend.ts` (866 lines, down from 933 once
  the namespace-registry seam landed — see Landed, 2026-06; no
  `oss-spec:allow-large-file:` opt-out) wires every backend's lifecycle
  into one hook: ~8 per-backend `useState` token vars (lines ~266–293),
  the Dropbox OAuth boot effect (~336–364), and the folder probe/connect/
  reconnect/disconnect set (~304–331, 576–657) — a return object with ~31
  keys. Adding a fourth backend means threading new state through 5+ spots
  in this file. The namespace-registry seam (state + reconcile + CRUD) is
  now peeled out into `useNamespaceRegistry.ts`; the **next recommended
  seam** is the per-backend token/disconnect friction row below.
  **Plan:** umbrella multi-PR split by concern; ship one seam per PR, each
  leaving the hook working and shrinking it. **Risk:** this is the central
  wiring for all three backends and the OAuth boot flow has **no automated
  coverage** — each seam must be smoke-tested by hand against LocalStorage
  plus whichever cloud backend it touches (Google Drive / Dropbox OAuth,
  unreachable from Vitest). Keep each PR < 500 lines. **Severity: 6.**

- **Shared logged-fetch block still duplicated across the cloud
  adapters.** The pure `requestLabel` / `describeError` helpers are now
  shared (see Landed, 2026-06), but the surrounding logging *block* —
  `performance.now()` start, `elapsed()`, the `try { … } catch` that warns
  with `describeError`, and the final `→ status (ms)` info/warn line — is
  still written out inline in gdrive's `createLoggedFetch` (~119–142) and
  Dropbox's `createAuthedFetch` (~250–287). Dropbox interleaves a
  401-silent-refresh retry between the catch and the final status line, so
  the two are not byte-for-byte and a clean `createLoggedFetch(fetchImpl,
  label)` factory has to thread that retry hook through. **Plan:** lift a
  shared logger that takes the fetch thunk and an optional post-throw retry
  callback; Dropbox composes it with its refresh step. **Risk:** threads
  the request + auth hot path which has **no automated coverage** —
  smoke-test a real Dropbox 401-refresh by hand. Lower value than the pure
  helpers were. **Severity: 3.**

- **Per-backend `disconnect*` callbacks share a clear→reset→switch
  shape.** The `disconnectDropbox` / `disconnectGdrive` / `disconnectFolder`
  callbacks (~`useStorageBackend.ts` 595–625 post-split) each run an
  analogous clear-tokens → reset-state → switch-to-browser dance. **Plan:**
  fold the common shape into a small helper (or a per-backend descriptor)
  so a fourth backend's disconnect is one entry, not a fourth hand-written
  callback; this is the recommended **next seam** of the god-hook split
  above. **Risk:** touches the cloud token lifecycle, which has **no
  automated coverage** — smoke-test disconnect against Dropbox / Google
  Drive by hand. **Severity: 4.**

### Easy wins

- **Extract the phantom-conflict resolver from `directory-adapter.ts`
  for testability.** `src/storage/directory-adapter.ts` (533 lines) embeds
  a subtle fingerprint / write-history / order-independent conflict
  algorithm inside a ~110-line `save()` closure that captures
  `recentWrites` / `lastFoldersJson` local state, so the algorithm can't
  be unit-tested in isolation. **Plan:** lift it into a small
  `PhantomConflictResolver` (or pure helpers) the adapter delegates to,
  then add the unit tests the seam makes possible — a high-value
  correctness algorithm currently has no direct coverage. **Risk:** pure
  relocation, but it guards real data-loss on flaky links — pin behaviour
  with a test written against the current code first, then refactor under
  it. **Severity: 4.**

## Landed

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

- **Centralise `splitPath` across the file backends** (skipped 2026-06).
  The roadmap claimed N≥3 call sites of the
  `path.split("/").filter((s) => s.length > 0)` idiom, but on re-verify
  only **two** remain (`src/storage/gdrive/index.ts` ~457 and
  `src/storage/folder/index.ts` ~92) — the claimed inline Dropbox site
  isn't there. A shared module + test for a one-line idiom at two trivial
  call sites is below the easy-win N≥3 threshold and the fix threshold.
  Re-evaluate if a third file grows the same idiom. **Was Severity 4 →
  re-rated 2.**
