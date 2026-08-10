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
| `checklist:backend`              | `"browser" \| "folder" \| "dropbox" \| "gdrive" \| "icloud"`  | `"browser"`   | Which storage backend is active (the **Settings → Storage** tab). Per-device; switching is a pure pointer flip — the dataset is not copied between backends (except the local-folder connect, which seeds an empty folder from the current document). `"icloud"` is only honoured inside the iOS native wrapper (feature-detected); a stored `"icloud"` downgrades to `"browser"` on the web build. |
| `checklist:dropbox:token`        | string                                | (unset)       | Dropbox OAuth access token. Short-lived; silently refreshed via the refresh token. |
| `checklist:dropbox:refresh`      | string                                | (unset)       | Dropbox refresh token, used to mint fresh access tokens without re-prompting. |
| `checklist:gdrive:token`         | string                                | (unset)       | Google Drive access token from the GIS popup. Short-lived (~1h); the user reconnects when it expires. |
| `checklist:encryption`           | `"encrypted" \| "plaintext"`          | `"plaintext"` | Whether stored bytes are wrapped in the AES-GCM envelope before saving. The passphrase itself is **never** stored — it lives in memory for the session only. |
| `checklist:settings:v1`          | JSON `Settings` blob                  | (defaults)    | Settings written by the **Settings → Theme** and **Settings → General** tabs: appearance (`theme`, `fontFamily`, `fontScale`, and the `customTheme` overrides — 18 colours + radius / density / border-width / reduce-motion) plus `addItemPosition` (`"top" \| "bottom"`, default `"bottom"`) `disableToasts` (default `false`), `disableAchievements` (default `false`), and `transforms` (the display-transform rules, empty by default — see **Transform** below). Read on boot and validated field-by-field — a corrupt or partial blob falls back to defaults. Appearance is applied live by the theme engine (`src/theme/useTheme.ts`); `system` follows `prefers-color-scheme`. On a file-based backend this same blob is mirrored to `settings.json` at the app-folder root (below). |
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
written stay saved and reappear when the toggle is turned back off. **Show
item count** (on by default) toggles the checked / total progress badge in
the list header.

Three toggles govern the order the list renders in. All three are
**view-only sorts** — the stored document order is never touched, so
switching one off drops every item straight back where it sat:

- **Sort checked items to the bottom** (off by default) sinks a checked
  item below the unchecked ones, most recently checked first.
- **Sort due dates to the top** (**on** by default) floats items carrying a
  due date to the head of the list, soonest — and overdue — first.
- **Sort held-back items to the bottom** (**on** by default) sinks items
  waiting on a "not before" day below the rest of the unchecked work,
  soonest gate first, but still above anything checked. An item whose gate
  has already passed is an ordinary item and doesn't move.

With all three on, a list reads: dated work, then free work, then
held-back work, then finished work. An item that is both dated and held
back sinks — a due date says when work must be finished, but a gate says it
can't be started at all.

These choices persist to `checklist:settings:v1`.

### Transform

The **Settings → Transform** tab holds the display transforms: regex rules
that rewrite how an item's title and note *read*, without changing what is
stored. Each rule is a pattern plus what a match becomes:

- **Link** — the replacement is an address, so a rule matching `#(\d+)`
  with `https://github.com/owner/repo/issues/$1` turns every `#134` into a
  tappable link. Capture groups are available as `$1`, `$2`, `$<name>`,
  and `$&` for the whole match. Only `http(s):`, `mailto:`, `tel:`, and
  in-app paths are opened; anything else renders as plain text.
- **Text** — an ordinary find-and-replace with the same templating.
- **Sensitive** — the match is masked: keep the first and last three
  (`076****123`), keep the last four (`******4123`), hide everything, or a
  fixed-width mask that hides the length too.

Rules run top to bottom, and a run one rule has claimed is left alone by
the rules below it. A rule can be parked (unchecked) without being
deleted. The editor previews the draft rule against sample text before you
save it, and offers an **Insert** dropdown of regex building blocks. The
list persists to `checklist:settings:v1` as `transforms`, so it syncs with
the rest of the settings.

> **Masking hides text on screen only.** The original stays in the stored
> document, in the synced file, and in the clipboard copy — use
> **Settings → Storage → Encryption** if you need the data itself
> protected.

### Storage

The **Settings → Storage** tab chooses where your lists are saved and
whether they're encrypted:

- **Backend** — **This device** (localStorage, the default), **iCloud**,
  **Local folder**, **Dropbox**, or **Google Drive**. The cloud options
  appear only when the build was given the matching app key / client id (see
  _Build-time configuration_); **Local folder** appears only in browsers
  that support the File System Access API directory picker (Chromium-based
  today); **iCloud** appears only inside the iOS native app (it needs the
  native bridge, so the web build never shows it). Picking a cloud backend
  connects it: Dropbox redirects to its consent screen and returns; Google
  Drive opens a popup. **Local folder** prompts you to pick a directory on
  this device — its grant is remembered in IndexedDB, and if the browser
  later asks again a **Reconnect folder** button re-grants it. **iCloud**
  needs no connect step at all: it rides your signed-in Apple account, so
  selecting it just switches to it.

  The **Local folder**, **Dropbox**, and **Google Drive** backends store
  each list as its own **markdown file** (standard `- [ ]` / `- [x]` task
  syntax, with the list name as the heading), so you can open, edit, diff,
  or back up your lists with any other tool. Turning on encryption replaces
  the per-list markdown with a single encrypted file, since an encrypted
  list can't be plain markdown. **iCloud** is a flat key-value store rather
  than files: it syncs the document across your Apple devices with no
  account and no sign-in of ours, but there are no per-list files to open.
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

### Inside a namespace folder

A namespace folder isn't only lists, which is why the checklists get a
`checklists/` subfolder of their own rather than sitting loose at the
namespace root:

```
default/                ← one namespace
├── checklists/         ← your checklists, one `.md` per list
│   ├── groceries-1a2b3c.md
│   └── Trips/          ← a list folder, mirrored as a real subdirectory
│       └── japan-9f8e7d.md
├── templates/          ← your templates, one `.md` per template
│   └── packing-4d5e6f.md
├── folders.json        ← the list-folder registry (folder ids → display names)
└── checklist.json      ← only when encryption is on: the whole document as one envelope
```

`templates/` is the sibling that makes the split necessary — a checklist
`.md` and a template `.md` are different kinds of document, and separating
them keeps a load from having to open every file to find out which is
which. `folders.json` and `checklist.json` are namespace-level metadata
that belong *beside* the lists, not among them. Keeping the two document
kinds in their own directories also means your list folders (which are
mirrored as real subdirectories under `checklists/`) can be named anything
— including "templates" — without colliding with the layout.

### App settings on a file-based backend

Your app settings (the **Theme**, **General**, and **Lists** preferences)
are device preferences, not list data — they aren't part of any one
checklist. On a file-based backend they live in a single **`settings.json`
file at the app-folder root**, *beside* the namespace folders rather than
inside one:

```
free-checklist/                 ← the app folder (Dropbox "Apps/" folder, Drive "checklist/", your picked folder)
├── settings.json               ← your app settings, shared by every namespace
├── namespaces.json             ← your list of namespaces, so it follows you across devices
├── default/                    ← the Default namespace's checklists
│   └── checklists/…
└── family/                     ← another namespace's checklists
    └── checklists/…
```

(The Dropbox app folder's name comes from `VITE_DROPBOX_APP_FOLDER` — see
[Build-time configuration](#build-time-configuration).)

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
reveals the **Developer** tab; the **Logs** tab appears alongside it only
once the Developer tab's **Capture logs** toggle is on — there's nothing
to show until logs are being kept. The in-app logger is itself a
developer diagnostic: it only records while developer mode or capture is
on, so the cloud sync-log panel in the sync-details dialog is shown only
in developer mode, and for a regular user logging is disabled outright.
These flags are device-local diagnostics — they live outside the
appearance blob so they never travel with a shared list.

| Key (in `localStorage`)       | Type       | Default | Effect |
|-------------------------------|------------|---------|--------|
| `checklist:dev:mode`          | `boolean`  | `false` | Whether developer mode (the Developer tab, the Logs tab once capture is on, and the sync-details log panel) is exposed. Also activates the in-app logger — it records nothing while this and capture are both off. |
| `checklist:dev:captureLogs`   | `boolean`  | `false` | When `true`, the in-app logger mirrors its ring buffer to `localStorage` so the **Logs** tab survives a reload, and the **Logs** tab is shown. Forced off when developer mode is turned off. |
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
| `VITE_DROPBOX_APP_FOLDER` | `src/storage/dropbox/` | `free-checklist` | Name of the Dropbox **App folder** the registered app owns. Display-only — it is the file location shown in the sync-details dialog and the target of the "Open in Dropbox" link; API paths are already relative to the app folder. Set it if your fork's Dropbox app uses a different folder name. |
| `VITE_GOOGLE_CLIENT_ID` | `src/storage/gdrive/` | _unset_ | Google OAuth client id (GIS token client). Unset hides the Google Drive backend in the picker. |

For the hosted deployment, `VITE_DONATE_URL`, `VITE_DROPBOX_APP_KEY`, and
`VITE_GOOGLE_CLIENT_ID` are stored as GitHub Actions **repository
secrets** and threaded into every build slot (production, `/preview/`,
and `/branch/`) by `.github/workflows/pages.yml`. A fork enables the
cloud backends by adding the same-named secrets to its own repository.

`VITE_DROPBOX_APP_FOLDER` is a GitHub Actions **repository variable**
instead — the folder name is public either way (every Dropbox user of the
app sees it in their `Apps/` directory), and a variable is readable in the
repository settings, so the deployed value can be checked against the
Dropbox app registration without guessing.

## Things that are deliberately not configurable

- **Telemetry.** There is none, and there is no flag to enable any.
- **Analytics endpoint.** Same.
- **Encryption passphrase recovery.** The passphrase is never stored and
  there is no reset path — by design. Forget it and the encrypted bytes
  are unreadable.
