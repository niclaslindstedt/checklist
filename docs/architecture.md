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
    local/      # localStorage adapter (default)
    drive/      # Google Drive app-folder adapter (planned)
    dropbox/    # Dropbox app-folder adapter (planned)
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
than deleting it. Templates and checklists are stored as plain JSON.
There is no migration story yet; a `version` field is reserved on each
top-level object.

## Storage

Persistence goes through a byte-oriented **adapter**, modelled on the
budget project's pattern, defined in `src/storage/adapter.ts`:

```ts
interface StorageAdapter {
  readonly id: "browser" | "dropbox" | "gdrive";
  readonly label: string;
  readonly capabilities: ReadonlySet<AdapterCapability>;
  loadSync?(): StoredSnapshot | null;
  load(): Promise<StoredSnapshot | null>;
  save(text: string, baseRevision?: string): Promise<StoredSnapshot>;
  watch?(onRemoteChange: (s: StoredSnapshot) => void): () => void;
}
```

Adapters speak **bytes**, not domain values: serialize / parse / (future)
migration live in `src/storage/serialize.ts` and run on every load and
save regardless of backend, so an adapter can never bypass the parse
pipeline. `StoredSnapshot` carries the text plus an opaque `revision`
token for optimistic concurrency (used by cloud backends) and an
`offline` flag. Capabilities (`loadSync`, `watch`, `getRevision`) let UI
gate on features rather than probing for methods.

The default adapter is `BrowserLocalStorageAdapter` (`id: "browser"`),
which reads and writes a single JSON document in `localStorage` under
the key `checklist:v1` and implements the synchronous `loadSync` fast
path so the first paint shows stored data. The Drive and Dropbox
adapters (planned) will keep an analogous document in their app-folder;
their SDKs are not part of the initial bundle and load on demand the
first time the user selects that backend.

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
