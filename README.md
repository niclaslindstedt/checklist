# checklist

A local-first PWA checklist app built with React, TypeScript, and
Tailwind. Keep a quiet, monospaced checklist — add items, check them
off, swipe to archive or delete — copy a list to share it, and — if
you want — sync them to **your own** Google Drive or Dropbox. Hosted on
GitHub Pages; talks to no other servers.

[![CI](https://github.com/niclaslindstedt/checklist/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/checklist/actions/workflows/ci.yml)
[![Pages](https://github.com/niclaslindstedt/checklist/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/checklist/actions/workflows/pages.yml)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm--NC--1.0.0-blue.svg)](LICENSE)

Try it: **<https://checklist.niclaslindstedt.se>**

## Why?

- **Local-first.** All data lives in `localStorage` (with `IndexedDB`
  for larger blobs). The app works fully offline and never requires
  an account.
- **No telemetry, no backend.** The only network calls the app ever
  makes are (a) loading itself from GitHub Pages and (b) — if and only
  if you opt in — talking directly to Google Drive or Dropbox.
- **Quick capture.** Type an item and hit Enter to add it; tap to check
  it off. Swipe a row **left** to uncover Delete, **right** to archive
  (archived items are hidden, not destroyed).
- **Quiet, monospaced UI.** A plain-text-editor feel, reminiscent of
  Obsidian. Ships dark by default, with a **Settings** cogwheel that opens
  a theme picker: eleven presets (One Dark/Light, Dracula, Monokai, GitHub
  Dark/Light, Solarized Light, Quiet Light, Excel, System) plus a fully
  custom theme, four fonts, and an adjustable text size.
- **Reusable templates.** Define a checklist once and stamp out as
  many instances as you need. *(Data model in place; UI on the roadmap.)*
- **Copy & paste lists.** Copy the whole active checklist to your
  clipboard from the header — plain `- [ ]` / `- [x]` task markdown,
  checked items still checked — and paste text straight into a list to
  add items. *(Sharing a list as a URL whose `#` fragment carries the
  payload: codec in place, UI on the roadmap.)*
- **Local folder + markdown files.** Point the app at a folder on your
  device (**Settings → Storage → Local folder**) and every list is saved
  there as its own markdown file — standard `- [ ]` / `- [x]` task syntax
  — so you can open, edit, diff, or back them up with any other tool.
  Dropbox and Google Drive store the same per-list markdown files; only
  **This device** keeps a single JSON document. (The folder picker needs
  a Chromium-based browser.)
- **Optional cloud sync.** Plug in Google Drive or Dropbox as a storage
  backend from **Settings → Storage**. The app uses each provider's
  app-folder scope, so it can only see files it created itself, and a
  conflict prompt resolves edits made on two devices at once.
- **Namespaces.** Keep separate checklists in named namespaces, each in
  its own folder, so you can share one namespace's cloud folder (say, a
  grocery list with the household) without sharing the rest. Switch and
  manage them from the top of the side menu.
- **Optional encryption.** Protect your lists with a passphrase — they're
  AES-GCM encrypted before they're saved, on this device and in the cloud.
- **PWA-ready.** Installable on any device, works offline, updates
  silently in the background via a service worker.

## Prerequisites

- **Node.js ≥ 20** (for builds only — the app itself runs in the
  browser with no Node runtime).
- A modern evergreen browser. Service workers, `localStorage`, and
  `IndexedDB` are required.

## Install

```sh
git clone https://github.com/niclaslindstedt/checklist.git
cd checklist
npm install
```

There is nothing to install for end users — open the hosted app in a
browser and (optionally) hit "Install" in the address bar.

## Quick start

```sh
npm run dev      # local dev server with hot reload
npm run build    # produce a static bundle in dist/
npm run preview  # serve the built bundle locally
npm test         # run the test suite
```

To deploy your own copy, fork the repo and enable GitHub Pages with
"GitHub Actions" as the source. The `pages.yml` workflow builds and
publishes on every push to `main`. It assembles up to three slots into
one deployment:

- `/` — the latest released `v*` tag (or `main`, before the first
  release).
- `/preview/` — the current `main`.
- `/branch/` — an optional feature-branch preview, parked via a
  `pages.yml` `workflow_dispatch` with a `branch_ref`.

The production app is served from the root (`/`) under the custom domain
in [`public/CNAME`](public/CNAME). Releases are cut by dispatching the
`Release` workflow; see [`AGENTS.md`](AGENTS.md) → "Releases and
changelog".

## React Native app

A React Native (Expo) front-end lives under [`native/`](native/). It reuses
the entire platform-agnostic core — the domain model, the `useChecklist`
app-state/undo/persistence hooks, serialize/migrations, and i18n — verbatim
from `src/`, and adds only a native presentation layer plus an AsyncStorage
backend. Building it for the app stores is a later problem; today it runs in
Expo Go and the simulators (`cd native && npm install && npx expo start`).
See [`native/README.md`](native/README.md) for what's implemented and how the
code is shared.

## Usage

1. **Add items.** Open the app and type into the composer at the bottom;
   Enter adds the item. The list persists to `localStorage` under the
   key `checklist:v1`.
2. **Check & manage.** Tap a row's checkbox to mark it done. Swipe a row
   **left** to reveal Delete, or **right** to archive it (archived items
   are hidden but kept).

3. **Sync across devices (optional).** Connect Google Drive or Dropbox
   from **Settings → Storage**, or point the app at a local folder; your
   lists then travel with you. See
   [Configuration](docs/configuration.md).

The feature below is still on the roadmap — the data model and module
boundaries are in place, but the UI is not wired up yet:

4. **Templates & URL sharing.** Stamp checklists out of reusable
   templates, and share a checklist as a URL whose `#` fragment carries
   the gzipped JSON (never sent to a server).

## Configuration

User-facing settings live in the app's **Settings** panel and persist
to `localStorage`. The full list of keys and defaults is documented in
[`docs/configuration.md`](docs/configuration.md).

The build is configured via `vite.config.ts`. Build-time inputs:

- `VITE_BASE` — the base path, set automatically per slot by the
  `pages.yml` workflow (`/` for production, `/preview/` for `main`,
  `/branch/` for the optional feature-branch preview).
- `VITE_DONATE_URL` — optional. When set, the header menu shows a
  **Donate** link pointing at it; leave it unset to hide the entry. See
  [`.env.example`](.env.example).

The header menu (top-right) also links to the
[privacy policy](https://checklist.niclaslindstedt.se/privacy), the
in-app changelog, and the source on GitHub, and is where the
**Settings** dialog now opens from.

## Troubleshooting

Common failure modes — quota exceeded errors, refused OAuth popups,
stuck service workers — are covered in
[`docs/troubleshooting.md`](docs/troubleshooting.md).

## Documentation

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Architecture](docs/architecture.md)
- [Troubleshooting](docs/troubleshooting.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

**Source-available, non-commercial.** Licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE).

You may use, copy, modify, and share this software freely for any
**non-commercial** purpose — personal use, education, research, and
open-source projects that are themselves non-commercial.

**Commercial use is reserved.** If you want to use `checklist` (or a
derivative) commercially, contact the author at
`nicl@slindstedt.se` to discuss a commercial licence.

This applies only to the source in this repository. Contributions are
accepted under the same license; see [CONTRIBUTING.md](CONTRIBUTING.md).
