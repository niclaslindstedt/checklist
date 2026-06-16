# Overview

How the app's subsystems and features actually behave — the "how it
works" companion to `docs/dictionary.md`.

The dictionary answers _"the user said X — which file is that?"_: it
maps every term to the most specific file and the symbols to grep for,
and stops there. **This file answers the next question** — _"I've
found the file, so how does this subsystem work, and what else does it
touch?"_ Every term in the dictionary has a matching entry here, under
the same section headings, so the two read as a pair: look the word up
in the dictionary to find the code, read the same word here to
understand it.

It is **not** a way to find code (the dictionary does that) and it is
**not** the module / persisted-shape inventory (`docs/architecture.md`
does that — the module layout, the `Snapshot` shape, the migration
runner, the storage seam). Read this to grasp a feature's behaviour and
its cross-module reach before working a request, especially to discover
the surfaces a change touches beyond the one file the request names.

**Maintain it in lockstep with the code, in the same PR.** When a
feature's behaviour changes, update its entry here — and the dictionary
row too if the file or symbols moved (usually only the overview needs
touching, since the dictionary row is just a pointer). Keep
descriptions to current behaviour and invariants, not changelog
narration ("used to…", "previously…"). Keep the inline `file.ts` /
`symbol` references so the prose stays navigable. The headings here
mirror the dictionary's sections one-to-one; add a new heading
whenever you add a dictionary row.

## Top-level UI

### App shell

`src/app/App.tsx` — the thin root component. Wires the cross-cutting
hooks (`useSettings`, `useTheme`, `useViewportHeight`,
`useStorageBackend`, `useChecklist`, `usePullToRefresh`,
`useUndoRedoShortcuts`) and hands state down to the views. It owns the
small bits of top-level UI state: which `view` is showing
(`"checklist"` or `"archive"`), whether the side menu / settings /
changelog are open, and which settings tab to open. It renders one of
`ChecklistView` / `ArchiveView` plus the always-mounted overlays
(`SideMenu`, `SettingsModal`, `ChangelogModal`,
`ConflictResolutionModal`, `UnlockGate`, `PullToRefreshIndicator`).

### Checklist view

`src/ui/ChecklistView.tsx` — the main screen. A pinned shell that never
scrolls: a header (app wordmark, the checked/total progress count, the
sync glyph, the header burger menu), an internally-scrolling list of
`ChecklistRow`s, and a sticky `AddItemForm` composer at the bottom.
Drag-to-reorder is wired here via `useListReorder`. The `SyncInfo` type
(also exported here) carries everything `SyncStatus` needs — provider
name, save status, dirty flag, `onSave`, `onOpenDetails` — and is null
for the local backend.

### Checklist row

`src/ui/ChecklistRow.tsx` — one item line, with a three-layer
swipe-to-reveal interaction driven by `useRowSwipe`. The foreground
holds a `Checkbox`, the title (struck through when checked), and a grip
handle for vertical reordering. Swiping **left** latches open a Delete
button (two-step, so a delete is never a single flick); swiping
**right** archives the row (hidden, not destroyed).

### Add-item form

`src/ui/AddItemForm.tsx` — the pinned composer at the bottom of the
checklist view: a plus glyph, a `ClearableInput`, and a submit button.
Enter adds the item, clears the field, and keeps focus so the user can
type item after item without re-tapping — a plain-text-editor feel.
Where the new item lands (top or bottom) follows the `addItemPosition`
setting.

### Archive view

`src/ui/ArchiveView.tsx` — the same pinned shell as the checklist view,
listing the active list's archived items. Each row offers Restore
(back into the active list) and Delete (permanent). There is no
composer and no reordering — items only ever enter the archive by being
swiped-right in the checklist view. Reached from the side menu.

### Side menu

`src/ui/SideMenu.tsx` — the navigation drawer, which collapses into a
single floating menu button the user can drag to either vertical edge
(its resting spot persists in `menuButtonPosition`). Pressing the
button slides the drawer in from that edge over a dimmed backdrop. The
drawer opens with the **namespace** section — the known namespaces (the
active one checked, click to switch) and a "New namespace" entry that
opens `NamespacesModal` — then lists the views (Checklist, Archive — the
latter badged with the archived-item count) and the Undo / Redo actions,
and highlights the current view. The `View` type
(`"checklist" | "archive"`) is exported here. Closes on Escape or
backdrop click. The floating button itself is positioned by
`useDraggableMenuButton` over the geometry in `sideMenuPosition.ts`.

### Floating menu button

The draggable launcher for the side menu. `useDraggableMenuButton`
(`src/ui/hooks/useDraggableMenuButton.ts`) follows the finger 1:1 while
dragging and snaps to the nearer edge on release; a press under the
drag threshold counts as a tap (so keyboard activation still works).
The snap / clamp math is pure in `src/ui/sideMenuPosition.ts`
(`restingRect`, `clampRect`, `rectToPosition`, `MENU_BUTTON_SIZE`,
`MENU_BUTTON_MARGIN`), translating between the persisted
`MenuButtonPosition` (edge + vertical fraction) and pixel coordinates
so the position survives viewport resizes.

### Header menu

`src/ui/HeaderMenu.tsx` — the top-right burger menu. Opens a
self-anchored dropdown with Settings and Changelog ("What's new")
shortcuts, plus links to the privacy policy, the source on GitHub (with
a build label), and — only when `VITE_DONATE_URL` is set — a Donate
link. Dismisses on outside click or Escape.

### Sync status

`src/ui/SyncStatus.tsx` — the header glyph that morphs to show the
cloud-sync state: an upload glyph with an accent ring when there are
unsaved edits, a spinner while saving, a green cloud-check when synced,
and a coloured cloud-alert for the conflict / auth / throttle / error
states. Tapping the upload glyph saves now (`onSave`); any other state
opens storage settings (`onOpenDetails`). Rendered only when a real
cloud backend is active — `App` passes a non-null `SyncInfo` only for
Dropbox / Google Drive, never for the local backend or while fake data
overrides the adapter.

### Modal

`src/ui/Modal.tsx` — the minimal accessible dialog primitive: a dimmed
backdrop, a centred card, Escape / backdrop-click to close, body-scroll
lock while open, and focus management (into the card on open, back to
the trigger on close). No portal — the app has a single root with no
competing stacking contexts. `SettingsModal`, `ChangelogModal`, and
`ConflictResolutionModal` build on it.

### Pull-to-refresh indicator

`src/ui/PullToRefreshIndicator.tsx` — the slide-down pill pinned to the
top of the viewport that surfaces the pull-to-refresh gesture. It
translates down with the pull and shows three states (pull / release /
refreshing), driven by the `state` and `pullDistance` from
`usePullToRefresh`. The gesture itself re-reads the active backend (see
Reload), the honest "pick up another device's edit" pull for the cloud
backends.

### Update toast

`src/ui/UpdateToast.tsx` — the soft "new build ready, click to reload"
prompt pinned above the safe-area inset, just under the general toast
stack. Shows the incoming version when known, a Reload button (posts
`SKIP_WAITING` to the waiting service worker), and a Dismiss button.
Mounted by `LanguageRoot`; the service-worker registration and update
polling live in `usePwaUpdate`.

### Toast

`src/ui/toast/Toast.tsx` (`ToastProvider`) plus
`src/ui/toast/useToast.ts` (`useToast`, `ToastContext`) — the
general-purpose notification stack pinned bottom-right. Variants
(`info` / `success` / `warning` / `error`) carry a coloured left
stripe keyed to the theme tokens; the visible stack is capped at three.
`useToast().push()` adds one, `dismiss()` removes it. Mounted globally
by `LanguageRoot` so any component can raise a toast.

## Checklist model and operations

### Snapshot

`Snapshot` (`src/domain/types.ts`) — the full persisted document: a
`templates[]` array and a `checklists[]` array. `emptySnapshot()` mints
the empty one. This is the unit every storage backend serialises (see
Serialize / parse). The UI today works against a single active
checklist (`checklists[0]`); the multi-list / template surfaces are on
the roadmap.

### Checklist

`Checklist` (`src/domain/types.ts`) — one checkable list instance:
`id`, a `templateId` (empty string for an ad-hoc list not stamped from
a template), `name`, `items[]`, and timestamps. Pure operations over it
live in `src/domain/checklists.ts`.

### Checklist item

`ChecklistItem` (`src/domain/types.ts`) — a checkable line: the base
`Item` fields (`id`, `title`, optional `notes` / `required`) plus
`checked` and an optional `archived` flag. Archived items stay in the
document but drop out of the active view (see Archive view).

### Active checklist / active list

The single checklist the UI currently renders — `doc.checklists[0]`,
resolved in `use-checklist.ts`. `withActiveList` guarantees the
document always has one to show, minting a default `"Checklist"` list
(via `createChecklist`) that isn't persisted until the first real edit,
so a bare reload never writes an empty document.

### use-checklist hook

`src/app/use-checklist.ts` (`useChecklist`) — the one place that wires
the pure domain operations to a concrete `StorageAdapter` and supplies
the side effects the domain deliberately avoids (id generation via
`crypto.randomUUID`, the clock). Each mutation (`addItem`, `toggle`,
`remove`, `archive`, `unarchive`, `reorder`) applies the matching
domain function, updates React state for an immediate re-render, records
the post-edit document on the undo timeline (`commit` → `record`), and
schedules a debounced save through the adapter. It owns the save state
machine (`SaveStatus`, `dirty`), the debounced-save plumbing
(`scheduleSave` / `flushSave` / `performSave`, coalescing a burst into
one write per `saveDebounceMs`), conflict detection
(`ConflictState`), `reload`, `saveNow`, and `resolveConflict`. It
exposes everything through the `UseChecklist` interface.

### Add item

`addItem` in `src/domain/checklists.ts` — returns a new checklist with
a fresh unchecked item appended (bottom, default) or prepended (top),
per the `position` argument the hook feeds from `addItemPosition`. The
hook trims the title and ignores an empty one.

### Toggle item

`toggleItem` (`src/domain/checklists.ts`) — flips a single item's
`checked` flag. Surfaced by tapping the row's checkbox.

### Delete item

`deleteItem` (`src/domain/checklists.ts`) — permanently drops the item
from the list. Reached by swiping a row left (or Delete in the archive
view). Recoverable only via undo, which resurrects it from the prior
whole-document snapshot.

### Archive / unarchive item

`setArchived` (`src/domain/checklists.ts`) — flips an item's `archived`
flag without destroying it. `activeItems` / `archivedItems` partition
the list into the checklist view and the archive view. Swiping a row
right archives; Restore in the archive view unarchives.

### Reorder item

`moveItem` (`src/domain/checklists.ts`) — moves an active item to a new
index **among the visible items**, keeping archived items pinned to
their absolute slots. `toIndex` is clamped and a no-op move returns the
same checklist untouched (no `updatedAt` bump, so it never writes). The
gesture is `useListReorder`; the commit happens once on drop.

### Progress / completion

`progress` and `isComplete` (`src/domain/checklists.ts`) — `progress`
returns checked/total over the visible items (the header count is the
hook's own `checkedCount`); `isComplete` is true when every `required`
item is checked. Required-item gating has no UI surface yet.

## Templates

### Template

`Template` (`src/domain/types.ts`) — a reusable, named list of `Item`s
with a stable `id` and timestamps. Pure operations live in
`src/domain/templates.ts` (`createTemplate`, `renameTemplate`,
`addItem`, `removeItem`). The data model and domain layer are in place;
there is **no template UI yet** — templates appear only in the dev seed
and in shareable/example JSON. New template surfaces go in `src/ui/`.

### Instantiate a template

`instantiate` (`src/domain/checklists.ts`) — stamps an independent,
all-unchecked `Checklist` out of a template, copying its items and
recording the source `templateId`. The "stamp out a checklist from a
template" verb; UI on the roadmap.

## Sharing

### Share link / shareable URL

`src/share/index.ts` — encode/decode a single `Checklist` into a
URL-fragment payload: JSON → gzip (`CompressionStream`) → base64url,
placed only after `#` so it is never sent to a server.
`encodeChecklist` produces the fragment string; `decodeChecklist`
parses one back (with or without a leading `#`). The data model is in
place; the share / import UI is on the roadmap.

### Example template

`examples/<slug>.json` — sample template JSON a user can import.
Referenced from the README; the in-app import surface is on the
roadmap.

## Settings and appearance

### Settings dialog

`src/ui/settings/SettingsModal.tsx` — the tabbed settings dialog opened
from the header menu (or the sync glyph, which deep-links to the Storage
tab via `initialTab`). Tabs (`TabId`): General, Theme (appearance),
Storage, and — only when dev mode is on — Developer and Logs. Tab
labels come from i18n. Built on `Modal`.

### Settings store

`src/settings/store.ts` + `src/settings/useSettings.ts` — the persisted
appearance `Settings` (theme preset, font family, font scale, the
custom-theme overrides, `addItemPosition`, `menuButtonPosition`), kept
in `localStorage` under `checklist:settings:v1`. `useSettings` is
apply-immediately: every `update(key, value)` writes through and
re-renders so the theme engine previews the change at once. `store.ts`
is defensive on read — a missing or corrupt field falls back to its
default rather than throwing. Note the `Settings` type deliberately
excludes the device-local dev flags (those live under `src/dev/`).

### General tab

`src/ui/settings/tabs/general.tsx` — the dev-mode toggle plus the
"add new items at top / bottom" choice that drives `addItemPosition`.

### Appearance / theme tab

`src/ui/settings/tabs/appearance.tsx` — the theme picker (light/dark
mode + variant), font family, text size, and — when the Custom theme is
selected — the per-colour overrides and the shape/motion controls
(corner radius, density, border width, reduce-motion).

### Theme engine

`src/theme/themes.ts` (the data: `ThemePreset` — the eleven presets
plus `system` and `custom`, `FontFamilyId`, `CustomTheme`,
`FONT_SCALE_PRESETS`, the palettes and lookup tables),
`src/theme/useTheme.ts` (the engine that projects `Settings` onto
`<html>` — `data-theme`, the font CSS var, the font-scale multiplier,
and the inline custom-theme overrides), and `src/theme/fonts.ts`
(on-demand webfont loading; the default `mono` is statically bundled,
the others lazy-load). CSS tokens live in `src/styles/theme.css` and
`src/styles/palettes.css`.

## Storage and sync

### Storage adapter

`StorageAdapter` (`src/storage/adapter.ts`) — the backend contract the
app talks to instead of touching `localStorage` directly. Adapters
speak bytes, not domain values (`load` / `save` / optional `loadSync`,
`getRevision`, `watch`), advertise an `AdapterCapability` set so UI
gates on capability rather than `adapter.foo !== undefined`, and carry
a `saveDebounceMs`. The error types `ConflictError`, `AuthError`, and
`RateLimitError` are defined here. New backends fill in the same
interface.

### useStorageBackend hook

`src/storage/useStorageBackend.ts` — the top-level storage wiring:
picks the active adapter from the saved preference, manages cloud OAuth
tokens, completes an OAuth redirect on load, and layers optional
at-rest encryption (`withEncryption`). Returns the active backend id /
adapter, per-provider connection status, the encryption mode, the
`locked` flag (and `unlock`), and methods to switch backend, connect /
disconnect a provider, and enable / disable encryption. It also owns the
active namespace: the inner adapter is built scoped to it, so switching
namespace swaps which document the app reads/writes, and it exposes the
namespace list plus `switchNamespace` / `createNamespace` /
`renameNamespace` / `removeNamespace`. The session passphrase is held in
memory only — never persisted, lost on reload.

### Namespaces

`src/storage/namespaces.ts` — the per-device registry of **namespaces**:
named buckets that each hold their own checklist document. The registry
(the list and the active slug) lives in `localStorage`, like the backend
preference, because the namespaces a person sees are a property of their
install, not of any one document. Every namespace has a `slug` (fixed at
creation, folder-/key-safe) and an editable display `name`; rename only
changes the name so data never has to move. The `default` namespace
always exists and can't be removed. `namespaceLocalKey` /
`namespaceCloudFolder` map a slug onto a concrete location: the default
namespace keeps the legacy `checklist:v1` key locally, every namespace
gets its own folder in the cloud (so a folder can be shared wholesale —
the `family/` folder shared with relatives). The management UI is
`NamespacesModal` (`src/ui/NamespacesModal.tsx`), reached from the
namespace section at the top of the side menu.

### Storage tab

`src/ui/settings/tabs/storage.tsx` — the UI for picking the backend
(This device / Dropbox / Google Drive), connecting / disconnecting a
cloud provider, and turning on at-rest encryption with a passphrase
(with the too-short / mismatch validation). Deep-linked from the sync
glyph.

### Local backend / This device

`src/storage/local/index.ts` (`BrowserLocalStorageAdapter`) — the
default backend, persisting the document to `localStorage`. The default
namespace keeps the historical key `checklist:v1`; other namespaces are
keyed `checklist:v1:<slug>` (there are no folders locally, so namespacing
is just a key change — `deleteLocalNamespace` removes one). It implements
the synchronous `loadSync` fast path (so the first paint shows stored
data, no empty-list flash) and saves immediately (`saveDebounceMs` 0).
The underlying `Storage` is injectable so tests pass an in-memory stub.

### Dropbox backend

`src/storage/dropbox/index.ts` — the Dropbox adapter, talking to the v2
HTTP API directly and storing each namespace's document as
`/<namespace>/checklist.json` inside the app's scoped folder
(`deleteDropboxNamespace` removes the whole folder). The default
namespace adapter performs a one-time, self-healing migration the first
time it loads an empty folder: it moves the legacy `/checklist.json` at
the app-folder root into `/default/checklist.json` (`move_v2`). Uses PKCE
OAuth with refresh tokens, a silent access-token refresh on 401 (then
`AuthError`), and the file `rev` for optimistic concurrency (write-mode
conflict → `ConflictError`). `isDropboxConfigured()` gates the connect
button on the build-time app key.

### Google Drive backend

`src/storage/gdrive/index.ts` — the Google Drive adapter, using the
Drive v3 REST API with the GIS token client (popup flow, no client
secret, `drive.file` scope, so it only sees files it created). Stores
each namespace's document in its own `checklist/<namespace>/` folder
(`deleteGdriveNamespace` removes the folder). The default namespace
adapter migrates the legacy `checklist/checklist.json` by re-parenting it
into `checklist/default/` the first time it loads an empty folder. Uses
the ETag for concurrency (412 → `ConflictError`). The GIS script is
lazy-loaded only when the user connects. `isGdriveConfigured()` gates the
connect button.

### At-rest encryption / unlock

`src/storage/encrypting/index.ts` (`withEncryption`) wraps any adapter
with password-based AES-GCM at the byte boundary (dropping `loadSync`,
since decrypt is async); the password is held by reference so it can be
changed at runtime. `src/storage/crypto.ts` is the pure envelope:
PBKDF2-SHA256 (600k iters) → AES-GCM-256, fresh salt + IV per write,
with a JSON discriminator (`isEncryptedEnvelope`) so encrypted and
plaintext documents share one storage slot. When encryption is on but
no passphrase is held (fresh load / reload), `UnlockGate`
(`src/ui/UnlockGate.tsx`) is the full-screen gate that blocks the app
until the user supplies the passphrase.

### OAuth (PKCE)

`src/storage/oauth-pkce.ts` — the shared, stateless OAuth 2.0 PKCE
helpers (verifier / challenge generation, flow tracking via
`sessionStorage`, provider routing, code → token exchange, refresh)
used by both cloud adapters.

### Serialize / parse

`src/storage/serialize.ts` — the seam where an adapter's opaque bytes
become a domain `Snapshot` and back. `serialize` writes canonical text
(JSON with a top-level `version` + trailing newline); `parse` runs the
migration chain and falls back to `emptySnapshot()` on corrupt /
absent / version-mismatched bytes, so a bad document never crashes the
app.

### Migrations

`src/storage/migrations.ts` — the forward-only migration chain that
upgrades a parsed raw document to `LATEST_VERSION` (currently 1).
`migrate` treats a missing `version` as v0 and runs the v0→v1 bootstrap
(guaranteeing both top-level arrays exist); a future version throws.

### Sync status / save state

The `SaveStatus` union (`idle` / `saving` / `saved` / `error` /
`conflict` / `auth-error` / `throttled`) from `use-checklist.ts` drives
the `SyncStatus` glyph. `dirty` tracks unsaved edits; `saveNow` flushes
the debounced save immediately.

### Reload / pull-to-refresh

`useChecklist.reload` re-reads the active backend and replaces what's on
screen, resetting the undo history to the freshly-loaded baseline. It's
a near-no-op round trip for the local backend but the real "pick up
another device's edit" pull for the cloud backends. The gesture is
`usePullToRefresh` (touch-only, suppressed while a modal owns the
screen); the visual is `PullToRefreshIndicator`.

### Conflict resolution

When a save loses a race with another device, the adapter throws
`ConflictError` and the hook turns it into a `ConflictState`.
`ConflictResolutionModal` (`src/ui/ConflictResolutionModal.tsx`) is the
non-dismissable prompt: it summarises the local and remote documents
side by side and makes the user pick. "Keep mine" re-saves this
device's bytes based on the remote revision; "Keep theirs" adopts the
remote bytes as the new baseline (no write-back, so it doesn't bounce
the conflict). Resolved via `useChecklist.resolveConflict`.

## Undo / redo

### Undo / redo

`src/app/use-undo-redo.ts` (`useUndoRedo`) — an in-memory timeline of
**whole-document snapshots** (capped at 50 past entries). `use-checklist`
calls `record` after every edit; `undo` / `redo` walk the cursor and
apply the target snapshot via `setData`, which both swaps the visible
document and persists it (so a revert survives a reload). `reset` clears
the history whenever a document arrives from outside the edit path
(initial load, backend swap, conflict resolution) so undo can't jump to
a vanished state. Recording the whole document (not a diff) is what lets
undo resurrect a deleted item. Reachable from the side menu and via
`useUndoRedoShortcuts` (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z / Ctrl+Y), which
bails out when focus is in an editable field so native field-level undo
still works.

## Dev mode

### Dev mode / fake data

`src/dev/useDevMode.ts` (`useDevMode`) holds two device-local flags —
`devMode` (whether the Developer / Logs settings tabs show) and
`captureLogs` — at module scope with a pub/sub layer and cross-tab
sync; turning dev mode off forces capture off. `src/dev/useDevSeed.ts`
(`useDevSeed`) backs the "Fake data" toggle as in-memory-only state (no
localStorage write), so a reload always drops back to the real backend.
When it's on, `App` swaps in an ephemeral seed adapter
(`createDevSeedAdapter`, `src/storage/dev-seed/index.ts`) preloaded by
`buildSeedSnapshot` (`src/dev/seed.ts`) — two sample templates and one
sample checklist — so `useChecklist` reloads sample data without
touching real data. Toggles live in the Developer settings tab.

### Logger / log capture

`src/dev/logger.ts` — the in-app logger: a bounded ring buffer (500
entries) with no console sink. `createLogger(scope)` returns an
`info` / `warn` / `error` logger; when "Capture logs" is on the buffer
mirrors to localStorage so it survives a reload. The Logs settings tab
(`src/ui/settings/tabs/logs.tsx`) renders it with a level filter and
copy / clear actions.

## i18n

### Translations / language

`src/i18n/index.ts` — the tiny custom i18n runtime: English is bundled
as default + fallback, other languages code-split and load on demand
(`ensureCatalog`), and lookups stay synchronous by falling back to
English. `useT()` returns the typed translation function (with `{name}`
interpolation over `MessageKey`); `tFor()` is the non-React lookup.
`src/i18n/locale.ts` defines the supported langs (`Lang` = `en | sv`)
and initial-language detection; `src/i18n/language-preference.ts`
mirrors the choice to localStorage (and broadcasts `LANGUAGE_EVENT`) so
the shell renders in the right language from first paint;
`src/i18n/LanguageRoot.tsx` is the top-level wrapper that provides the
language, mounts the toast provider + update toast, and gates the first
paint until the initial catalog loads. Catalog namespaces live under
`src/i18n/locales/<lang>/` (app, changelog, common, menu, nav, pwa,
settings, sync, toast).

## PWA

### Service worker / app update

`src/pwa/usePwaUpdate.ts` (`usePwaUpdate`) — the single source of truth
for the PWA update lifecycle, shared by `UpdateToast` and the header
wordmark fill. Registers the service worker via `workbox-window`, tracks
download progress by polling the precache against the manifest total
(0..100), and exposes `needRefresh`, the `incomingVersion`, `reload`
(posts `SKIP_WAITING`), and `dismiss`. The manifest and icons are
configured in `vite.config.ts` (see the `tune-pwa-icons` skill).

### Changelog / what's new

`src/ui/changelog/ChangelogModal.tsx` — the "What's new" dialog reached
from the header menu, listing every shipped release newest-first
(version, date, the Added/Changed/Fixed/… sections). The data is the
repo's `CHANGELOG.md`, inlined by Vite as a raw string
(`src/ui/changelog/data.ts`) and parsed by the pure, DOM-free
Keep-a-Changelog parser `parseChangelog` (`src/ui/changelog/parse.ts`).

### Privacy page

`src/ui/PrivacyPage.tsx` — the standalone privacy policy served at
`/privacy`, stating the app is local-only with no backend, accounts,
analytics, or tracking. Deliberately short and English-only (a legal
page, not chrome).

## Workflows / verbs the user might say

### Add an item

Type into the `AddItemForm` composer and press Enter. Lands at the top
or bottom per `addItemPosition`.

### Check / uncheck an item

Tap the row's checkbox (`toggleItem`). The title strikes through and the
header count updates.

### Delete an item

Swipe a `ChecklistRow` left to latch open Delete, then tap it
(`deleteItem`), or use Delete in the archive view. Recoverable via undo.

### Archive an item

Swipe a `ChecklistRow` right (`setArchived(…, true)`). The item leaves
the active view but stays in the document; find it in the archive view.

### Restore an item

Open the archive view (side menu) and tap Restore
(`setArchived(…, false)`).

### Reorder items

Drag a row by its grip handle (`useListReorder` → `moveItem`). Commits
once on drop.

### Undo / redo

Side-menu Undo / Redo, or Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z / Ctrl+Y.
Walks the whole-document timeline.

### Pull to refresh

Drag down from the top of the list (`usePullToRefresh` →
`useChecklist.reload`) to re-read the backend — meaningful for the cloud
backends.

### Open settings

Header burger menu → Settings, or tap the sync glyph (deep-links to the
Storage tab).

### Switch storage backend

Settings → Storage → pick This device / Dropbox / Google Drive, then
connect the cloud provider via OAuth.

### Turn on encryption

Settings → Storage → enable encryption and set a passphrase. Future
loads gate behind `UnlockGate` until the passphrase is supplied.

### Resolve a conflict

When another device saved first, `ConflictResolutionModal` makes you
choose Keep mine / Keep theirs.

### Share a list

Encode a checklist to a `#`-fragment URL (`encodeChecklist`). Data model
in place; the share UI is on the roadmap.

### Use a template

Stamp a checklist out of a reusable template (`instantiate`). Data model
in place; the template UI is on the roadmap.

## Conventions for editing this file

- One H3 per dictionary term, under the H2 that mirrors the dictionary
  section. The heading is the primary term (slash-aliases go in the
  prose); qualify a name that collides with another section's term.
- Explain current behaviour and invariants — control flow, the data it
  reads / writes, the surfaces it touches. Not changelog narration
  ("used to…", "previously…", PR numbers).
- Keep the inline `file.ts` / `symbol` references so the prose stays
  navigable; the dictionary row carries the same path as the lookup
  key.
- Every term added here gets a matching `dictionary.md` row (and vice
  versa) **in the same PR** as the code change. The two move together.
- Deep module / persisted-shape mechanics that aren't about a single
  user-facing concept belong in `docs/architecture.md`, not here.
