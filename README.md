# checklist

A local-first PWA checklist app written in TypeScript. Define reusable
templates once, stamp out checklist instances, share them as URLs or
JSON, and — if you want — sync them to **your own** Google Drive or
Dropbox. Hosted on GitHub Pages; talks to no other servers.

[![CI](https://github.com/niclaslindstedt/checklist/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/checklist/actions/workflows/ci.yml)
[![SEO](https://github.com/niclaslindstedt/checklist/actions/workflows/seo.yml/badge.svg)](https://github.com/niclaslindstedt/checklist/actions/workflows/seo.yml)
[![Pages](https://github.com/niclaslindstedt/checklist/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/checklist/actions/workflows/pages.yml)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm--NC--1.0.0-blue.svg)](LICENSE)

Try it: **<https://niclaslindstedt.github.io/checklist/>**

## Why?

- **Local-first.** All data lives in `localStorage` (with `IndexedDB`
  for larger blobs). The app works fully offline and never requires
  an account.
- **No telemetry, no backend.** The only network calls the app ever
  makes are (a) loading itself from GitHub Pages and (b) — if and only
  if you opt in — talking directly to Google Drive or Dropbox.
- **Reusable templates.** Define a checklist once and stamp out as
  many instances as you need.
- **Shareable lists.** Export a checklist as a URL or JSON blob; anyone
  with the link can import it in one click. The payload travels in the
  URL fragment, so it is never sent to a server.
- **Optional cloud sync.** Plug in Google Drive or Dropbox as a storage
  backend. The app uses each provider's app-folder scope, so it can
  only see files it created itself.
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
publishes on every push to `main`.

## Usage

1. **Create a template.** Open the app, choose **New template**, add
   items. Templates live in `localStorage` under the key
   `checklist:templates`.
2. **Instantiate.** From a template, hit **New checklist** to spawn an
   independent, checkable copy.
3. **Share.** Click **Share** to copy a URL whose `#` fragment contains
   the gzipped JSON of the checklist. Opening it imports a fresh copy.
4. **Sync (optional).** In **Settings → Storage**, choose Google Drive
   or Dropbox and authorize via OAuth. From then on, changes are
   mirrored to an app-folder in the provider you picked.

## Configuration

User-facing settings live in the app's **Settings** panel and persist
to `localStorage`. The full list of keys and defaults is documented in
[`docs/configuration.md`](docs/configuration.md).

The build is configured via `vite.config.ts`. The only build-time
input is the GitHub Pages base path (`VITE_BASE`), which the
`pages.yml` workflow sets automatically.

## Examples

See [`examples/`](examples/) for sample template JSON you can import
via **Settings → Import**.

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
