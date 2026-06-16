# Configuration

`checklist` has no config files. All user-facing settings are reached
through **Settings** inside the app and persist to `localStorage`.

## User settings

| Key (in `localStorage`)          | Type                                  | Default       | Effect |
|----------------------------------|---------------------------------------|---------------|--------|
| `checklist:backend`              | `"browser" \| "folder" \| "dropbox" \| "gdrive"`  | `"browser"`   | Which storage backend is active (the **Settings → Storage** tab). Per-device; switching is a pure pointer flip — the dataset is not copied between backends (except the local-folder connect, which seeds an empty folder from the current document). |
| `checklist:dropbox:token`        | string                                | (unset)       | Dropbox OAuth access token. Short-lived; silently refreshed via the refresh token. |
| `checklist:dropbox:refresh`      | string                                | (unset)       | Dropbox refresh token, used to mint fresh access tokens without re-prompting. |
| `checklist:gdrive:token`         | string                                | (unset)       | Google Drive access token from the GIS popup. Short-lived (~1h); the user reconnects when it expires. |
| `checklist:encryption`           | `"encrypted" \| "plaintext"`          | `"plaintext"` | Whether stored bytes are wrapped in the AES-GCM envelope before saving. The passphrase itself is **never** stored — it lives in memory for the session only. |
| `checklist:settings:v1`          | JSON `Settings` blob                  | (defaults)    | Settings written by the **Settings → Theme** and **Settings → General** tabs: appearance (`theme`, `fontFamily`, `fontScale`, and the `customTheme` overrides — 18 colours + radius / density / border-width / reduce-motion) plus `addItemPosition` (`"top" \| "bottom"`, default `"bottom"`). Read on boot and validated field-by-field — a corrupt or partial blob falls back to defaults. Appearance is applied live by the theme engine (`src/theme/useTheme.ts`); `system` follows `prefers-color-scheme`. |
| `checklist:settings:autoArchive` | `boolean`                             | `false`       | When `true`, fully-completed checklists are moved to **Archive** the next time the app opens. |
| `checklist:settings:locale`      | BCP-47 string                         | browser value | Override the formatting locale (does not change UI strings; this app is English-only for now). |

### Appearance

The **Settings → Theme** tab offers eleven presets — One Dark, One Light,
Dracula, Monokai, GitHub Dark, GitHub Light, Solarized Light, Quiet Light,
Excel, System (follows the OS), and Custom — plus four bundled fonts
(monospace, sans-serif, serif, OpenDyslexic) and an adjustable text size.
Picking **Custom** opens an 18-slot colour editor with corner-radius,
density, border-width, and reduce-motion controls. Changes apply live and
persist to `checklist:settings:v1`.

### General

The **Settings → General** tab holds list-behaviour preferences. **Add
new items to** chooses whether a new entry is appended to the **bottom**
(the default) or prepended to the **top** of the list. The choice persists
to `checklist:settings:v1`.

### Storage

The **Settings → Storage** tab chooses where your lists are saved and
whether they're encrypted:

- **Backend** — **This device** (localStorage, the default), **Local
  folder**, **Dropbox**, or **Google Drive**. The cloud options appear
  only when the build was given the matching app key / client id (see
  _Build-time configuration_); **Local folder** appears only in browsers
  that support the File System Access API directory picker (Chromium-based
  today). Picking a cloud backend connects it: Dropbox redirects to its
  consent screen and returns; Google Drive opens a popup. **Local folder**
  prompts you to pick a directory on this device — its grant is remembered
  in IndexedDB, and if the browser later asks again a **Reconnect folder**
  button re-grants it.

  Every backend except **This device** stores each list as its own
  **markdown file** (standard `- [ ]` / `- [x]` task syntax, with the
  list name as the heading), so you can open, edit, diff, or back up your
  lists with any other tool. Turning on encryption replaces the per-list
  markdown with a single encrypted file, since an encrypted list can't be
  plain markdown.
- **Encryption** — turn it on with a passphrase to wrap your lists in an
  AES-GCM envelope (PBKDF2-SHA256, 600k iterations) before they're saved,
  on this device and in the cloud. There is **no recovery**: forget the
  passphrase and the data can't be read. After a reload the app shows an
  **unlock** prompt until you re-enter it. Turning encryption off (while
  unlocked) rewrites the document back to plaintext.

When two devices edit the same cloud document and a save collides, a
**conflict** dialog asks which copy to keep — there is no automatic merge.

### Namespaces

A **namespace** is a named bucket holding its own checklist. You start in
the **Default** namespace; the section at the top of the side menu lets
you switch namespaces, and the **New namespace** entry opens a dialog to
create, rename, or delete them. The set of namespaces is per device — it
isn't stored inside any document — so each device (or family member)
manages its own list.

Each namespace lives in its own folder on the file-based backends
(`<name>/` under your picked folder, Dropbox, or Google Drive), so you can
share one namespace's folder — a grocery list with the household — without
sharing the rest. On **This device** each namespace is simply a separate
localStorage entry.
Deleting a namespace also deletes its data in the **currently active**
backend; copies in another backend or on another device are left
untouched. The Default namespace can't be deleted, and your existing
single checklist is migrated into it automatically the first time a
cloud backend loads.

### Developer settings (device-local)

The **Settings → General** tab has a **Developer mode** switch that
reveals the **Developer** and **Logs** tabs. These flags are device-local
diagnostics — they live outside the appearance blob so they never travel
with a shared list.

| Key (in `localStorage`)       | Type       | Default | Effect |
|-------------------------------|------------|---------|--------|
| `checklist:dev:mode`          | `boolean`  | `false` | Whether developer mode (the Developer / Logs tabs) is exposed. |
| `checklist:dev:captureLogs`   | `boolean`  | `false` | When `true`, the in-app logger mirrors its ring buffer to `localStorage` so the **Logs** tab survives a reload. Forced off when developer mode is turned off. |
| `checklist:dev:logs`          | JSON array | (unset) | The persisted log entries, present only while capture is on. |

The Developer tab's **Fake data** toggle is in-memory only — it swaps in
an ephemeral seed backend for the session and is **never** persisted, so a
reload always returns to your real lists.

## OAuth credentials

The Google Drive and Dropbox backends use **public client IDs**
embedded in the bundle. No client secret is involved — these providers'
PKCE / GIS-token flows are designed for static apps. They're read from
build-time env vars (`VITE_DROPBOX_APP_KEY`, `VITE_GOOGLE_CLIENT_ID`); an
unset key disables that backend in the picker. If you fork the repo,
register your own apps (see the setup notes in `src/storage/dropbox/` and
`src/storage/gdrive/`), set the env vars, and add your deployment origin
to each provider's allowed JavaScript origins / redirect URIs.

## Build-time configuration

| Env var           | Read by             | Default | Effect |
|-------------------|---------------------|---------|--------|
| `VITE_BASE`       | `vite.config.ts`    | `/`     | Public path the bundle is served from. The Pages workflow sets it per slot: `/` for the released production build, `/preview/` for `main`, `/branch/` for the optional feature-branch preview. |
| `VITE_DONATE_URL` | `src/ui/SideMenu.tsx` | _unset_ | When set to a URL, the side menu shows a **Donate** entry linking to it. Unset or blank hides the entry. See [`.env.example`](../.env.example). |
| `VITE_DROPBOX_APP_KEY` | `src/storage/dropbox/` | _unset_ | Dropbox app key (PKCE public client). Unset hides the Dropbox backend in the picker. |
| `VITE_GOOGLE_CLIENT_ID` | `src/storage/gdrive/` | _unset_ | Google OAuth client id (GIS token client). Unset hides the Google Drive backend in the picker. |

## Things that are deliberately not configurable

- **Telemetry.** There is none, and there is no flag to enable any.
- **Analytics endpoint.** Same.
- **Encryption passphrase recovery.** The passphrase is never stored and
  there is no reset path — by design. Forget it and the encrypted bytes
  are unreadable.
