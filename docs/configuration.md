# Configuration

`checklist` has no config files. All user-facing settings are reached
through **Settings** inside the app. They always persist to `localStorage`
(the synchronous first-paint cache); on a file-based backend (Local folder,
Dropbox, Google Drive) they are **also** written to a `settings.json` file
at the app-folder root so they travel with the synced/shared folder — see
[App settings on a file-based backend](#app-settings-on-a-file-based-backend).

## User settings

| Key (in `localStorage`)          | Type                                  | Default       | Effect |
|----------------------------------|---------------------------------------|---------------|--------|
| `checklist:backend`              | `"browser" \| "folder" \| "dropbox" \| "gdrive"`  | `"browser"`   | Which storage backend is active (the **Settings → Storage** tab). Per-device; switching is a pure pointer flip — the dataset is not copied between backends (except the local-folder connect, which seeds an empty folder from the current document). |
| `checklist:dropbox:token`        | string                                | (unset)       | Dropbox OAuth access token. Short-lived; silently refreshed via the refresh token. |
| `checklist:dropbox:refresh`      | string                                | (unset)       | Dropbox refresh token, used to mint fresh access tokens without re-prompting. |
| `checklist:gdrive:token`         | string                                | (unset)       | Google Drive access token from the GIS popup. Short-lived (~1h); the user reconnects when it expires. |
| `checklist:encryption`           | `"encrypted" \| "plaintext"`          | `"plaintext"` | Whether stored bytes are wrapped in the AES-GCM envelope before saving. The passphrase itself is **never** stored — it lives in memory for the session only. |
| `checklist:settings:v1`          | JSON `Settings` blob                  | (defaults)    | Settings written by the **Settings → Theme** and **Settings → General** tabs: appearance (`theme`, `fontFamily`, `fontScale`, and the `customTheme` overrides — 18 colours + radius / density / border-width / reduce-motion) plus `addItemPosition` (`"top" \| "bottom"`, default `"bottom"`) `disableToasts` (default `false`), and `disableAchievements` (default `false`). Read on boot and validated field-by-field — a corrupt or partial blob falls back to defaults. Appearance is applied live by the theme engine (`src/theme/useTheme.ts`); `system` follows `prefers-color-scheme`. On a file-based backend this same blob is mirrored to `settings.json` at the app-folder root (below). |
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

The **Settings → General** tab holds the **Disable toasts** toggle —
when on, the general pop-up notification stack is suppressed (the "new
build ready" upgrade hint still appears) — and the **Disable
achievements** toggle, which switches the achievements system off: the
watcher stops recording unlocks and raising celebratory toasts, and the
header trophy button is hidden. Achievements already earned are kept, so
turning the toggle back off resumes tracking. In the installed PWA on a
phone / tablet it also holds the **Show menu button** toggle. These
choices persist to `checklist:settings:v1`. List-behaviour preferences
live on the **Settings → Lists** tab.

### Lists

The **Settings → Lists** tab holds list-behaviour preferences: **Add new
items to** (top or bottom of the list) and **Disable item notes** — when
on, items are title-only: the markdown note body beneath each title is
hidden and the editor's note field is dropped, but any notes already
written stay saved and reappear when the toggle is turned back off. These
choices persist to `checklist:settings:v1`.

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
create, rename, or delete them.

On a file-based backend (Local folder, Dropbox, Google Drive) your **list
of namespaces travels with the backend**, the same way your settings do: it
is stored in a `namespaces.json` file at the app-folder root (below). When
you connect that backend on a **new device**, the device adopts the
namespaces already in the cloud **and** uploads any it had locally — so
nothing is dropped and your namespaces follow you across devices. Which
namespace is currently *active* stays per-device — that's just a local
cursor. On **This device** (no cloud) the list simply lives in this
browser's `localStorage`.

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

### App settings on a file-based backend

Your app settings (the **Theme**, **General**, and **Lists** preferences)
are device preferences, not list data — they aren't part of any one
checklist. On a file-based backend they live in a single **`settings.json`
file at the app-folder root**, *beside* the namespace folders rather than
inside one:

```
checklist.niclaslindstedt.se/   ← the app folder (Dropbox "Apps/" folder, Drive "checklist/", your picked folder)
├── settings.json               ← your app settings, shared by every namespace
├── namespaces.json             ← your list of namespaces, so it follows you across devices
├── default/                    ← the Default namespace's checklists
│   └── checklists/…
└── family/                     ← another namespace's checklists
    └── checklists/…
```

So one settings file is shared by every namespace and travels with the
folder you sync or share. On first connect the file is **seeded** from this
device's current settings; if the folder already has one (another device
wrote it), the app **adopts** it. `localStorage` still holds a copy so the
theme applies instantly on load with no flash. `settings.json` stays
**plaintext JSON even when the checklist document is encrypted** — theme and
font choices aren't secret, and keeping them readable lets the unlock screen
render in your theme. On **This device** there are no folders, so settings
stay in `localStorage` only.

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

For the hosted deployment, `VITE_DONATE_URL`, `VITE_DROPBOX_APP_KEY`, and
`VITE_GOOGLE_CLIENT_ID` are stored as GitHub Actions **repository
secrets** and threaded into every build slot (production, `/preview/`,
and `/branch/`) by `.github/workflows/pages.yml`. A fork enables the
cloud backends by adding the same-named secrets to its own repository.

## Things that are deliberately not configurable

- **Telemetry.** There is none, and there is no flag to enable any.
- **Analytics endpoint.** Same.
- **Encryption passphrase recovery.** The passphrase is never stored and
  there is no reset path — by design. Forget it and the encrypted bytes
  are unreadable.
