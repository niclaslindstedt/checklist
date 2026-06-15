# Configuration

`checklist` has no config files. All user-facing settings are reached
through **Settings** inside the app and persist to `localStorage`.

## User settings

| Key (in `localStorage`)          | Type                                 | Default       | Effect |
|----------------------------------|--------------------------------------|---------------|--------|
| `checklist:settings:backend`     | `"local" \| "drive" \| "dropbox"`    | `"local"`     | Which storage backend is active. Switching backends migrates the current dataset to the new one. |
| `checklist:settings:theme`       | `"system" \| "light" \| "dark"`      | `"system"`    | Color scheme override. |
| `checklist:settings:autoArchive` | `boolean`                            | `false`       | When `true`, fully-completed checklists are moved to **Archive** the next time the app opens. |
| `checklist:settings:locale`      | BCP-47 string                        | browser value | Override the formatting locale (does not change UI strings; this app is English-only for now). |

## OAuth credentials

The Google Drive and Dropbox backends use **public client IDs**
embedded in the bundle. No client secret is involved — these
providers' "implicit + PKCE" flows are designed for static apps. If
you fork the repo, replace the placeholders in `src/storage/drive/`
and `src/storage/dropbox/` with your own client IDs and add your
deployment origin to each provider's allowed redirect URIs.

## Build-time configuration

| Env var      | Read by             | Default | Effect |
|--------------|---------------------|---------|--------|
| `VITE_BASE`  | `vite.config.ts`    | `/`     | Public path the bundle is served from. The Pages workflow sets it per slot: `/` for the released production build, `/preview/` for `main`, `/branch/` for the optional feature-branch preview. |

## Things that are deliberately not configurable

- **Telemetry.** There is none, and there is no flag to enable any.
- **Analytics endpoint.** Same.
- **Encryption at rest.** Cloud storage relies on the provider's own
  encryption. A user-supplied passphrase is a future feature, not a
  setting today.
