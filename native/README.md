# checklist — React Native app

A React Native (Expo) front-end for **checklist**, sharing the entire
platform-agnostic core with the web PWA. This is a separate Expo project that
lives alongside the web app; **deploying / building it for the stores is a
later problem** — today it runs in Expo Go and the simulators.

## How it reuses the web app

The web app's architecture (see [`../AGENTS.md`](../AGENTS.md)) keeps a clean
split between platform-agnostic logic and the DOM presentation layer. The
native app imports the logic verbatim from `../src` and supplies its own
React Native views in `native/src/`:

| Layer | Source | Shared with web? |
|---|---|---|
| Data model + pure operations | `../src/domain/` | ✅ verbatim |
| App state, edits, undo/redo, persistence engine | `../src/app/use-checklist*.ts`, `use-undo-redo.ts` | ✅ verbatim |
| Storage contract, serialize, migrations, namespaces | `../src/storage/{adapter,serialize,migrations,namespaces}.ts` | ✅ verbatim |
| i18n runtime + catalogs | `../src/i18n/` | ✅ verbatim |
| **Local storage backend** | `native/src/storage/asyncStorageAdapter.ts` | ⛔ native (AsyncStorage) |
| **Presentation** | `native/src/components/`, `native/src/App.tsx` | ⛔ native (`View`/`Text`/…) |
| **Theme tokens** | `native/src/theme.ts` | ⛔ native (no CSS variables) |

The shared core required **no refactoring** to be consumed here: every web
global it touches (`localStorage`, `navigator`) is already behind a `typeof
… === "undefined"` guard, so on React Native it transparently falls back
(single default namespace, English locale, empty `loadSync`). The only
runtime shim is a `crypto.randomUUID` polyfill — see
`native/src/polyfills.ts`.

The `AsyncStorageAdapter` implements the same `StorageAdapter` contract as the
web's `BrowserLocalStorageAdapter`, so `useChecklist` drives it unchanged. It
does not advertise the synchronous `loadSync` capability (AsyncStorage has no
sync read); `useChecklistSync` already tolerates that by seeding empty and
loading in its mount effect.

## What's implemented

The core checklist flows, all backed by the shared hook:

- View the active checklist; check / uncheck items (strike-through + header
  count), add items via the bottom composer.
- Archive an item (hidden, not destroyed) and Restore / Delete it from the
  Archive screen.
- Delete an item (recoverable via Undo).
- Switch between checklists, create a new one, rename the active list inline
  from the header, and remove a list — all from the list-switcher sheet.
- Undo / Redo across the whole-document timeline.

### Not yet ported (web-only for now)

Cloud backends (Dropbox / Google Drive), at-rest encryption + unlock gate,
the full theme engine (presets / custom colours / fonts), settings UI,
sharing, templates UI, swipe gestures (archive/delete are explicit buttons
here), and pull-to-refresh. These layers are either DOM/CSS-bound or depend
on browser-only APIs; they can grow into `native/` incrementally without
touching the shared core.

## Running it

> Requires the native app's own dependencies. From this directory:

```sh
cd native
npm install          # or: npx expo install (to align versions with the SDK)
npx expo start       # then press i / a, or scan the QR with Expo Go
```

Metro is configured (`metro.config.js`) to watch the repo root so the
shared modules in `../src` are transformed and hot-reloaded as part of the
app. `react` and `react-native` are pinned to this app's `node_modules` so
the shared hooks bind to the same React instance the renderer uses.

Type-check the native app (includes the shared core it imports):

```sh
npm run typecheck
```
