# Architecture

`checklist` is a single-page TypeScript PWA served as static files from
GitHub Pages. There is no server-side component. Every byte of user
data either lives in the browser or — if the user opts in — in the
user's own Google Drive or Dropbox account.

## Module layout

The UI is built with **React 19** and styled with **Tailwind v4**. The
build is Vite; there is no router yet (a single view).

```
src/
  app/        # <App> root, top-level state hook (use-checklist), entry
  ui/         # React components + custom form primitives and hooks
    form/       # Button, Checkbox, ClearableInput (no native chrome)
    hooks/      # UI hooks (e.g. useRowSwipe)
    toast/      # toast provider + viewport (useToast)
  i18n/       # typed t() runtime + per-language catalogs (locales/)
  domain/     # pure functions over the data model (no I/O, no DOM)
  storage/    # pluggable persistence adapters
    local/        # localStorage adapter (default, single JSON document)
    folder/       # File System Access API adapter (markdown files on disk)
    gdrive/       # Google Drive app-folder adapter (markdown files)
    dropbox/      # Dropbox app-folder adapter (markdown files)
    markdown/     # Snapshot <-> per-list markdown codec
    directory-adapter.ts # shared markdown file store over a FileStore
    encrypting/   # AES-GCM wrapper layered over any adapter
    cache/        # offline mirror for cloud adapters (withLocalCache)
    migrations.ts # forward-only version chain for stored bytes
  theme/      # theme engine (useTheme) + preset/font data
  styles/     # Tailwind theme tokens + per-theme palettes
  share/      # encode/decode URL-fragment payloads
  pwa/        # service-worker registration + update lifecycle (usePwaUpdate)
```

### Dependency direction

```
        ┌──────┐
        │  ui  │
        └──┬───┘
           │
   ┌───────┴────────┐
   ▼                ▼
┌──────────┐   ┌─────────┐
│  domain  │ ◄ │ storage │
└──────────┘   └─────────┘
```

- `ui/` imports from `domain/` and `storage/`.
- `storage/` imports from `domain/` for the model types only.
- `domain/` imports nothing else from `src/`, no DOM, no `fetch`.

This direction is enforced by an ESLint rule and verified in CI.

## Data model

Three types live in `src/domain/types.ts`:

- `Template` — a named list of `Item`s. Identifies itself by a stable
  `id` (UUIDv7).
- `Checklist` — a checkable list. Either an instance of a template or a
  free-standing list (empty `templateId`). Holds a snapshot of the
  items, each with a `checked` flag and an optional `archived` flag.
- `Item` — `{ id, title, notes?, required? }`; a `ChecklistItem` adds
  `checked` and optional `archived`.

Archived items stay in the document but are filtered out of the active
view (`activeItems`) — swiping a row right marks it archived rather
than deleting it. The browser backend stores templates and checklists as
one JSON document; the file-based backends store each as its own markdown
file (see Storage below).

The persisted document carries a top-level numeric `version`. A
forward-only migration chain (`src/storage/migrations.ts`, adapted from
the budget project's `data/migrations`) upgrades older bytes to
`LATEST_VERSION` on every load — a document with no `version` reads as
version 0 (the pre-versioning shape) and is normalised on the way in.
The migration seam lives in `src/storage/serialize.ts`, not in
`domain/`, so the in-memory `Snapshot` stays version-free.

## Storage

Persistence goes through a byte-oriented **adapter**, modelled on the
budget project's pattern, defined in `src/storage/adapter.ts`:

```ts
interface StorageAdapter {
  readonly id: "browser" | "folder" | "dropbox" | "gdrive" | "dev" | "icloud";
  readonly label: string;
  readonly capabilities: ReadonlySet<AdapterCapability>;
  loadSync?(): StoredSnapshot | null;
  load(): Promise<StoredSnapshot | null>;
  save(text: string, baseRevision?: string): Promise<StoredSnapshot>;
  getRevision?(): Promise<string | null>;
  watch?(onRemoteChange: (s: StoredSnapshot) => void): () => void;
  readonly saveDebounceMs?: number;
}
```

Adapters speak **bytes**, not domain values: serialize / parse /
migration live in `src/storage/serialize.ts` and run on every load and
save regardless of backend, so an adapter can never bypass the parse
pipeline. `StoredSnapshot` carries the text plus an opaque `revision`
token for optimistic concurrency (used by cloud backends) and an
`offline` flag. Capabilities (`loadSync`, `watch`, `getRevision`) let UI
gate on features rather than probing for methods.

The default adapter is `BrowserLocalStorageAdapter` (`id: "browser"`),
which reads and writes a single JSON document in `localStorage` under
the key `checklist:v1` and implements the synchronous `loadSync` fast
path so the first paint shows stored data.

The `"icloud"` id has no web counterpart: it belongs to the React Native
app's iOS-only iCloud backend (`native/src/storage/icloudStorageAdapter.ts`),
which stores the document in Apple's iCloud key-value store and is offered
only on iOS. It lives in the shared union so the native adapter satisfies the
same contract — see [`native/README.md`](../native/README.md).

**Namespaces.** Each adapter is scoped to a *namespace* — a named bucket
holding its own document. The registry is read synchronously from
`localStorage` (`src/storage/namespaces.ts`) for first paint and adapter
construction, but on a file backend the **list** is mirrored to
`namespaces.json` at the app-folder root (see *Root namespace registry*
below) so it travels with the synced/shared folder; only the **active**
slug stays per-device. `useStorageBackend` builds the active adapter
scoped to the active namespace, so switching namespace just swaps the
adapter (the same seam the fake-data toggle and backend switch use). The
local backend keys each namespace separately (`checklist:v1` for
`default`, `checklist:v1:<slug>` otherwise); the file-based backends
(local folder, Dropbox, Drive) give each namespace its own folder so a
whole namespace folder can be shared with another account or opened in
another tool.

**Markdown file store.** The three file-based backends do *not* store one
JSON blob; each namespace is a directory of individual markdown files,
one per checklist and template, using standard `- [ ]` / `- [x]` task
syntax so the lists open in any editor. This is implemented once in
`src/storage/directory-adapter.ts` (`createDirectoryAdapter`), which
wraps a tiny `FileStore` (`src/storage/file-store.ts` —
`list`/`read`/`write`/`remove`) into a full `StorageAdapter`: the
`Snapshot` ↔ files conversion lives in the codec
(`src/storage/markdown/codec.ts`), conflict detection rides an aggregate
of the directory's per-file revisions, and an **encrypted** store (whose
bytes can't be markdown) falls back to a single `checklist.json` envelope
— which is also where the pre-markdown legacy cloud document is read from
and migrated to markdown on the next plaintext save. Only the browser
backend keeps the single JSON document.

**Root settings file.** App settings (theme, font, list-behaviour
preferences) are device-wide, not part of any one namespace's document, so
they live *outside* the namespace folders. The `SettingsStore` seam
(`src/storage/settings-store.ts`) persists them as a single
`settings.json` at the **app-folder root** — the level above the namespace
folders — so one file is shared by every namespace and travels with the
synced/shared folder. `fileSettingsStore` builds one over any backend's
`FileStore` constructed with an *empty namespace* (its paths then resolve
at the app-folder root rather than inside a namespace folder); each
file-based backend exports a `create*SettingsStore`, and
`useStorageBackend` exposes the active backend's as `settingsStore` (null
for the browser backend, whose settings stay in `localStorage`). It is
independent of the document adapter and of encryption — `settings.json`
stays plaintext even when the document is an encrypted envelope.
`useSettings` reconciles against it (adopt-or-seed on mount, write-through
on update) while keeping `localStorage` as the synchronous first-paint
cache.

**Root namespace registry.** The list of namespaces gets the same
treatment as settings: it is mirrored to a single `namespaces.json` at the
**app-folder root**, beside `settings.json`, so it follows the user across
devices. The `NamespaceRegistryStore` seam
(`src/storage/namespace-store.ts`) and `fileNamespaceStore` mirror the
settings store; each file-based backend exports a `create*NamespaceStore`,
and `useStorageBackend` exposes the active one as `namespaceStore` (null
for the browser backend). When a file backend is (re)selected the hook
**reconciles**: it loads `namespaces.json` and merges it with the device's
list (`mergeNamespaceLists`) so the backend wins any shared slug while this
device's local-only namespaces are kept, writes the merged list to
`localStorage`, and pushes it back up when the device contributed
namespaces the backend lacked (`hasLocalOnlyNamespaces`) — so connecting on
a new device adopts the cloud's namespaces *and* uploads its own rather
than dropping either. A missing remote file is seeded from the device. The
create / rename / appearance / remove verbs also write-through to
`namespaceStore`. The **active** namespace pointer is deliberately *not*
synced — it's a per-device cursor.

**Local folder backend.** `createFolderAdapter`
(`src/storage/folder/index.ts`) implements a `FileStore` over the **File
System Access API**: the user picks a directory, its handle is persisted
in IndexedDB (`folder/handle-store.ts`) so the grant survives reloads,
and namespaces are subfolders of it. It's offered only where
`showDirectoryPicker` exists (Chromium today); elsewhere the picker
option is hidden. A revoked grant surfaces a Reconnect cue and falls back
to the browser store.

**Cloud backends.** `createDropboxAdapter` and `createGdriveAdapter` each
implement a `FileStore` over a per-app folder in the user's own Dropbox
or Google Drive, talking to the providers' HTTP APIs directly (no SDK in
the bundle). Both authenticate through the shared OAuth PKCE helpers
(`src/storage/oauth-pkce.ts`) — Dropbox via a redirect with silent
refresh-token rotation, Google Drive via the GIS popup token client — and
set a one-second `saveDebounceMs` so a burst of edits coalesces into one
network write. Each is gated on a build-time app key / client id
(`VITE_DROPBOX_APP_KEY`, `VITE_GOOGLE_CLIENT_ID`); unset keys hide the
backend in the picker. `useStorageBackend` selects the
active adapter from a per-device preference, holds the tokens, and
completes the Dropbox OAuth redirect on boot.

**Encryption.** `withEncryption` (`src/storage/encrypting/`) wraps any
adapter and applies an AES-GCM + PBKDF2 envelope (`src/storage/crypto.ts`)
at the byte boundary, so the same wrapper encrypts whether the bytes end
up in localStorage or a cloud folder. The passphrase is held only in
memory for the session; after a reload the app is "locked" until the
user re-enters it (the `UnlockGate`). Receipts of plaintext-at-rest pass
through untouched so toggling encryption never strands a document.

**Offline cache.** `withLocalCache` (`src/storage/cache/`) wraps the cloud
adapters (Dropbox, Google Drive) and mirrors every successful load / save
into this device's `localStorage`, keyed per backend and namespace. When a
request fails with a raw network error (airplane mode, a dead tunnel) it
serves the cached bytes instead, flagged `offline: true` on the
`StoredSnapshot`; the typed signals (`Auth` / `Conflict` / `RateLimit`)
are never masked. It sits *below* `withEncryption`
(`cloudAdapter → withLocalCache → withEncryption → app`), so the cache
holds the encrypted envelope when encryption is on and the plaintext JSON
when it isn't — and because it is the `inner` the unlock gate verifies
against, unlocking works offline against the cached envelope. An offline
save stashes the attempted bytes locally (on the last good revision) and
re-throws so the sync engine keeps the edit queued; the engine's `online`
listener re-flushes it when connectivity returns. `useChecklist.offline`
surfaces the state to the header glyph (`CloudOffIcon`) so a stale local
copy never reads as "synced". When the backend is unreachable *and*
nothing is cached (a brand-new device offline), the load throws
`OfflineUnavailableError` so the unlock gate says "you're offline" rather
than the misleading "wrong passphrase".

**Conflict resolution.** When a save loses a race with another device,
the cloud adapter throws `ConflictError` carrying the remote bytes;
`useChecklist` surfaces it as a `conflict` and the
`ConflictResolutionModal` lets the user keep their copy (re-save over the
remote) or take the remote (adopt its bytes). Adapters also throw
`AuthError` (re-auth needed) and `RateLimitError` (HTTP 429 cooldown).
A `RateLimitError` parks the session in `throttled` and auto-resumes once
the cooldown (the backend's `retryAfterMs`, floored against an
exponential backoff curve and escalated per consecutive 429) elapses;
any other save failure is retried with the same backoff up to a small
budget before going red. The backoff curve and the retryable-error
predicate live in the pure `src/storage/save-retry.ts`.

**Status glyph.** For a cloud-backed session, `useChecklist` exposes a
coarse `SaveStatus` (idle / saving / saved / error / conflict /
auth-error / throttled) and a `dirty` flag; saves are debounced by the
adapter's `saveDebounceMs`. The header's `SyncStatus` glyph (ported from
budget) morphs with that state — an accent
cloud-upload when there are unsaved edits (tap to save now), a spinner
while saving, a green check when synced, and a coloured alert for
conflict / auth / throttle / error (tap to open the Storage settings).
It is hidden for the local backend, where there is nothing to sync.

## Theming

`src/theme/` holds a small framework-free **theme engine** (the
`useTheme` hook) adapted from the budget project. It projects the active
preset onto a `data-theme` attribute on `<html>` and the chosen font
stack onto the `--app-font-family` variable; CSS owns the palettes.
`src/styles/theme.css` binds each Tailwind colour utility
(`bg-surface`, `text-fg`, …) to a `--<slot>` custom property via
`@theme inline`, and `src/styles/palettes.css` overrides those slots per
`data-theme`, so every utility follows the theme without re-listing
colours. Dark (One Dark) is the default; there is no theme-picker UI
yet, but the preference is read from `localStorage` and the engine is
wired for one.

## Sharing

`src/share/` encodes a checklist as a gzipped, base64-URL-safe blob
and places it in the URL fragment (`#…`). Fragments are not sent to
servers, so a shared link never leaks the contents anywhere but the
recipient's browser. On import, the recipient receives a brand-new
local copy with a fresh id.

## PWA

The service worker is generated by `vite-plugin-pwa` with a `precache`
strategy for the app shell and `networkFirst` for the cloud-storage
hosts. It is registered in production builds only.

Registration uses a **prompt** update strategy (`registerType:
"prompt"`, `injectRegister: null`): `src/pwa/usePwaUpdate.ts` registers
the worker itself through `workbox-window` (so it can pass
`updateViaCache: "none"` and re-fetch `sw.js` from the network on every
update check). A freshly-deployed build installs and parks in the
`waiting` state rather than swapping in silently, so an in-progress edit
is never interrupted. `src/ui/UpdateToast.tsx` surfaces the
"reload to apply" prompt, naming the incoming version read from the
build-time `version.json` (emitted into each slot root by the
`emit-version-json` plugin in `vite.config.ts`). Clicking Reload posts
`SKIP_WAITING` to the waiting worker and reloads once it takes over.

While the new worker is installing, `usePwaUpdate` turns its download
into a visible **progress fill**: the header "checklist" title fills with
the theme accent from the bottom — a vertical power bar — driven by the
`progress` field. It is computed by polling this slot's Workbox precache
cache and summing the byte sizes of the assets already stored against the
total in `precache-manifest.json` (emitted alongside `version.json` by
the `emit-precache-manifest` plugin, read back out of the generated
`sw.js`). The slot-specific Workbox `cacheId` keeps the three Pages slots
sharing one origin from measuring each other's bytes. The fill jumps to
full and the toast appears when the `waiting` event fires.

The three slots share one origin but stay isolated as separate
installable apps. Each slot's manifest `id`/`scope`/`start_url` is its
base path, its `name`/`short_name` carry a `(preview)` / `(branch)`
suffix, and a `navigateFallbackDenylist` stops one slot's worker from
answering navigations for another — without it the production worker
(scope `/`) would serve the production app shell at `/preview/` and
`/branch/`, so a PWA installed from a non-root slot would silently run
production. The denylist matches both the slash-less (`/preview`) and
trailing-slash (`/preview/`) spellings, since GitHub Pages 301-redirects
the former but the worker intercepts before the network.

`src/ui/hooks/usePullToRefresh.ts` adds a touch-only **pull-to-refresh**
gesture: a damped downward drag from the top of the list, surfaced by
`src/ui/PullToRefreshIndicator.tsx`, re-reads the active backend via
`useChecklist`'s `reload` once it crosses the trigger distance. It is
gated off while a modal owns the screen.

The running build's identifier — `<version>[.<run>][-<slot>][+<commit>]`,
computed in `vite.config.ts` from `package.json`, `GITHUB_RUN_NUMBER`,
and `GITHUB_SHA` — is exposed as `BUILD_LABEL` via `src/build-env.ts`
and shown next to the header.

## Internationalization

UI strings live in per-language catalogs under `src/i18n/locales/`. A
tiny runtime (`src/i18n/index.ts`) provides a typed `t()` lookup with
`{name}` interpolation; English is bundled and is the fallback, while
every other language is code-split and loaded on demand. `LanguageRoot`
(`src/i18n/LanguageRoot.tsx`) provides the active language (persisted via
`src/i18n/language-preference.ts`, detected from the browser on first
visit), mounts the shared toast viewport (`src/ui/toast/`), and renders
the update prompt.

## Build & deploy

`vite build` produces a fully static bundle in `dist/`. The GitHub
Pages workflow (`.github/workflows/pages.yml`) publishes it on every
push to `main`, serving the production app from the root (`/`) under
the custom domain in `public/CNAME`. The base path is injected via
`VITE_BASE` so the same bundle works at `/`, `/preview/`, `/branch/`,
or any subpath. The released `v*` tag is served at `/`, the current
`main` at `/preview/`, and an optional dispatched feature branch at
`/branch/`. See `AGENTS.md` → "Releases and changelog" for the full
release flow.
