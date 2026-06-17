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

### Easy wins

_None pending._

## Landed

- **R1. `useStorageBackend.ts` backend-selection branching collapsed to one
  site** (2026-06). The active backend is now resolved once into a
  discriminated `BackendSelection` (`dropbox | gdrive | folder | browser`);
  the namespace-scoped document adapter (`inner`) and the root
  `settingsStore` each switch on that single selection instead of
  re-deriving the `backend && token` if-chain — the duplicated Dropbox
  auth-config object (with its `onAccessTokenRefreshed` setter closures) is
  gone. `selection` is keyed independently of `activeNamespace` so a
  namespace switch still rebuilds only the document adapter, keeping the
  settings-store identity stable (`useSettings` reloads on
  `[settingsStore]`). Behaviour-preserving; the OAuth boot effects,
  encryption gate, and folder probe are untouched. The deeper
  per-backend driver-hook split the file could still take was left out — it
  rewrites OAuth flows that have no automated coverage, and nothing today
  justifies the risk; revisit if a fourth backend lands.
- **R3. `icons.tsx` split into themed family files** (2026-06). The
  613-line append-only barrel became three sibling files under
  `src/ui/icons/` — `status.tsx` (cloud/sync/spinner/refresh), `nav.tsx`
  (app chrome / menu / modal-title glyphs), `action.tsx` (row/item actions
  and carets) — over a shared `IconProps` in `icons/shared.ts`. `icons.tsx`
  is now a 13-line `export *` barrel, so a new glyph lands in a small family
  file with no edit to the shared hub and every existing `./icons.tsx`
  import keeps working. Pure relocation; the barrel disables
  `react-refresh/only-export-components` (a re-export module has no Fast
  Refresh boundary).
- **R4. `themes.ts` palettes made a single-source table** (2026-06). The
  nine standalone `DEFAULT_CUSTOM_THEME_COLORS_*` literals plus the
  `PRESET_PALETTES` map that re-listed them (two edit sites per theme)
  collapsed into one: the literals now live inline in `PRESET_PALETTES`
  (still type-checked per entry against `CustomThemeColors`), and the two
  names still referenced elsewhere (`_DARK` externally in `appearance.tsx`,
  `_DARK`/`_LIGHT` internally) are derived aliases. Adding a theme is now
  one table entry plus its registration in `ThemePreset` / `THEMES` / the
  family arrays.

## Investigated and skipped

- **Google Drive's missing HTTP 429 → `RateLimitError` mapping.** Flagged on
  the last sweep as a backend contract divergence (Dropbox maps 429,
  Drive doesn't), but it is being handled in a separate PR, not as a
  refactor-roadmap item — leave it out so a future sweep doesn't re-propose
  it.
- **Extracting Dropbox's `createAuthedFetch` 401 → refresh → retry wrapper
  into `oauth-pkce.ts`.** Dropbox's authed-fetch wrapper
  (`src/storage/dropbox/index.ts`) silently refreshes on 401 and retries
  once. Tempting to "complete" the shared OAuth module by lifting it — but
  Google Drive uses GIS popup tokens that **cannot** be refreshed, so it
  will never use the wrapper, and Dropbox is the only refresh-token backend
  today. Extracting now is the speculative-abstraction anti-pattern (a
  single caller). Land it **with** the PR that adds a second refresh-token
  backend, not before.
- **App.tsx provider/modal-host nesting and SideMenu row-styling
  duplication.** The nested context-provider + modal-host return in
  `App.tsx` and the three near-identical menu-row components in
  `SideMenu.tsx` (`NavItem` / `MenuButton` / `MenuLink`) are
  readability/cosmetic only (rated <3): no bad logic, both files well under
  the size cap. Re-surface only if `App.tsx` grows another wave of modals or
  the menu-row styling starts diverging.
