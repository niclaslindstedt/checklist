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

- **HTTP error-body extraction duplicated across all three OAuth/HTTP
  adapters.** `gdrive/index.ts` (557 lines), `dropbox/index.ts` (420 lines),
  and `oauth-pkce.ts` (245 lines) each inline the same defensive
  `await res.text().catch(() => "<unreadable>")` to read an error response
  body before building an error — 15 call sites total (gdrive 7, dropbox 6,
  oauth-pkce 2; re-verify with `grep -rn 'res\.text()\.catch' src/storage`).
  Every new HTTP API call and every new backend re-types the same fallback.
  **Plan:** extract `async function readErrorBody(res: Response):
  Promise<string>` into a shared `src/storage/http-utils.ts` (sibling to
  `adapter.ts`); replace all 15 sites. **Risk:** purely mechanical, but the
  call sites live inside the Dropbox / Google Drive OAuth + file-op flows
  that have **no automated coverage** — smoke-test signin, token refresh, and
  a failed upload/download on both cloud backends so error messages still
  surface. **Severity: 6.**
- **Base64URL encode/decode reimplemented in two layers.** `oauth-pkce.ts:11`
  (`base64UrlEncode`, encode-only, used for PKCE verifier/challenge) and
  `share/index.ts:21`/`:30` (`toBase64Url` / `fromBase64Url`, the full
  round-trip used for shareable URL fragments) carry independent copies of
  the same `btoa`/`atob` + `+→-`, `/→_`, strip-`=` transform. Any fix to one
  (padding, URL-safety edge case) silently skips the other. **Plan:** lift
  both directions into a shared leaf module (e.g. `src/encoding/base64url.ts`)
  exporting `toBase64Url(bytes)` / `fromBase64Url(text)`; have `oauth-pkce`
  and `share` import it. Both `storage/` and `share/` may depend on a shared
  util, so the layering holds. **Risk:** both are pure — assert the round-trip
  `fromBase64Url(toBase64Url(b)) === b`, and smoke-test one OAuth signin
  (PKCE) plus one share-link encode/decode since neither path is covered by
  the cross-layer move. **Severity: 5.**

### Severity 3–4 — nits with leverage

- **`Retry-After` header parsing duplicated between the two rate-limited
  backends.** `gdrive/index.ts:74` wraps it in `driveRetryAfterMs()`
  (`Number(headers?.get("Retry-After") ?? "")` → `isFinite` guard → fallback
  → seconds-to-ms); `dropbox/index.ts:323` inlines the identical block inside
  its 429 handler. Two sites today; a third rate-limited backend would copy it
  again. **Plan:** extract `parseRetryAfterMs(headers, fallbackMs): number`
  into the same `http-utils.ts` as the `readErrorBody` finding above (land
  them together if both are picked up). **Risk:** rate-limit backoff has no
  unit coverage — mock a 429 with a `Retry-After` in seconds and confirm the
  computed delay is in ms. **Severity: 4.**

### Easy wins

_None pending._

## Landed

_None._

## Investigated and skipped

- **Typed-cast wrapper for `res.json()` in the cloud adapters.** `gdrive`
  (lines 161, 190, 248) and `dropbox` (line 265) each write
  `(await res.json()) as SomeResponse`. Tempting to centralise as
  `parseJson<T>(res)`, but the cast is already TypeScript-checked at the call
  site, carries no runtime validation either way, and a shared helper would
  just relocate the same unchecked assertion — no leverage. Cosmetic (<3).
  Reconsider only if response validation (zod-style) is ever introduced, at
  which point the helper becomes the natural seam.
- **`bytesToHex` helper for `gdrive` multipart boundary.** `gdrive/index.ts`
  (`randomBoundary`, ~line 372) hex-encodes random bytes inline
  (`b.toString(16).padStart(2, "0")`). It's the only hex call site in the
  tree, so extracting a `bytesToHex` util now is the single-caller
  speculative-abstraction anti-pattern. Land it only if a second hex caller
  appears.
