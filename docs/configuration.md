# Configuration

`checklist` has no config files. All user-facing settings are reached
through **Settings** inside the app and persist to `localStorage`.

## User settings

| Key (in `localStorage`)          | Type                                 | Default       | Effect |
|----------------------------------|--------------------------------------|---------------|--------|
| `checklist:settings:backend`     | `"local" \| "drive" \| "dropbox"`    | `"local"`     | Which storage backend is active. Switching backends migrates the current dataset to the new one. |
| `checklist:settings:v1`          | JSON `Settings` blob                 | (defaults)    | Appearance settings written by the **Settings → Theme** tab: `theme`, `fontFamily`, `fontScale`, and the `customTheme` overrides (18 colours + radius / density / border-width / reduce-motion). Read on boot and validated field-by-field — a corrupt or partial blob falls back to defaults. Applied live by the theme engine (`src/theme/useTheme.ts`); `system` follows `prefers-color-scheme`. |
| `checklist:settings:autoArchive` | `boolean`                            | `false`       | When `true`, fully-completed checklists are moved to **Archive** the next time the app opens. |
| `checklist:settings:locale`      | BCP-47 string                        | browser value | Override the formatting locale (does not change UI strings; this app is English-only for now). |

### Appearance

The **Settings → Theme** tab offers eleven presets — One Dark, One Light,
Dracula, Monokai, GitHub Dark, GitHub Light, Solarized Light, Quiet Light,
Excel, System (follows the OS), and Custom — plus four bundled fonts
(monospace, sans-serif, serif, OpenDyslexic) and an adjustable text size.
Picking **Custom** opens an 18-slot colour editor with corner-radius,
density, border-width, and reduce-motion controls. Changes apply live and
persist to `checklist:settings:v1`.

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
embedded in the bundle. No client secret is involved — these
providers' "implicit + PKCE" flows are designed for static apps. If
you fork the repo, replace the placeholders in `src/storage/drive/`
and `src/storage/dropbox/` with your own client IDs and add your
deployment origin to each provider's allowed redirect URIs.

## Build-time configuration

| Env var           | Read by             | Default | Effect |
|-------------------|---------------------|---------|--------|
| `VITE_BASE`       | `vite.config.ts`    | `/`     | Public path the bundle is served from. The Pages workflow sets it per slot: `/` for the released production build, `/preview/` for `main`, `/branch/` for the optional feature-branch preview. |
| `VITE_DONATE_URL` | `src/ui/HeaderMenu.tsx` | _unset_ | When set to a URL, the header menu shows a **Donate** entry linking to it. Unset or blank hides the entry. See [`.env.example`](../.env.example). |

## Things that are deliberately not configurable

- **Telemetry.** There is none, and there is no flag to enable any.
- **Analytics endpoint.** Same.
- **Encryption at rest.** Cloud storage relies on the provider's own
  encryption. A user-supplied passphrase is a future feature, not a
  setting today.
