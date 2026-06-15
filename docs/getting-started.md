# Getting started with checklist

A local-first PWA for checklists with reusable templates and optional
Google Drive / Dropbox sync.

## As a user

1. Open <https://niclaslindstedt.github.io/checklist/> in any modern
   browser.
2. (Optional) Click the **Install** prompt in the address bar to add
   the app to your home screen. It will work offline from then on.
3. Create a **template** — a checklist with named items but no state.
4. From the template, hit **New checklist** to spawn a checkable
   instance.
5. Use **Share** to send a checklist as a URL. The payload lives in
   the URL fragment, so it is never sent to any server; whoever opens
   the link gets a fresh local copy.
6. (Optional) Open **Settings → Storage** and connect Google Drive or
   Dropbox if you want your data synced across devices. The app uses
   each provider's app-folder scope; it can only see files it created.

## As a developer

```sh
git clone https://github.com/niclaslindstedt/checklist.git
cd checklist
npm install
npm run dev
```

Vite serves the app at <http://localhost:5173> with hot reload. The
service worker is disabled in dev so changes are picked up
immediately.

To build a production bundle:

```sh
npm run build      # outputs to dist/
npm run preview    # serve the production bundle locally
```

The GitHub Pages workflow (`.github/workflows/pages.yml`) builds and
publishes on every push to `main`.

## Next steps

- [Configuration reference](configuration.md)
- [Architecture overview](architecture.md)
- [Troubleshooting](troubleshooting.md)
