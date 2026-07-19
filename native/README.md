# checklist — native wrapper

A **thin native wrapper** around the checklist web app. It ships no UI of its
own: it embeds the built web bundle, serves it from a loopback HTTP origin,
and shows it in a full-screen WebView. What you get on iOS and Android is the
same app as the web, running entirely offline from inside the app binary.

> This replaced an earlier React Native re-implementation that rebuilt the
> checklist UI in native views. That app only ever covered a fraction of the
> web feature set and drifted from it; the wrapper is feature-complete by
> construction. The old implementation is in git history (`a2f6a73`,
> `afdb7ef`) if it is ever needed.

## How it works

```
../src  ──vite build (VITE_NATIVE=1)──▶  native/webroot/
                                              │
                              expo prebuild + plugins/withWebroot.js
                                              │
                                   ios/…/webroot   android/…/assets/webroot
                                              │
                              @dr.pogodin/react-native-static-server
                                              │
                                   http://localhost:8791
                                              │
                                        react-native-webview
```

| Piece | File |
|---|---|
| Web build in native flavour | `../vite.config.ts` (`VITE_NATIVE=1`), `npm run build:native` |
| Copy the bundle into the native projects | `plugins/withWebroot.js` |
| Extract + locate the bundle at runtime | `src/webroot.ts` |
| Start / stop the loopback server | `src/useStaticServer.ts` |
| The WebView and its navigation rules | `src/App.tsx` |

### Why a local HTTP server and not `file://`

`file://` is not a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
in WebKit, and the app depends on APIs that are gated behind one:

- `crypto.randomUUID()` (`../src/app/side-effects.ts`) — used for every id the
  app mints. Undefined on `file://`, so **adding an item throws**.
- `crypto.subtle` (`../src/storage/crypto.ts`, `../src/storage/oauth-pkce.ts`)
  — at-rest encryption and the Dropbox / Google Drive OAuth PKCE exchange.

WKWebView also treats `file://` as an opaque origin, which breaks
`localStorage` — where every checklist lives. Serving from `http://localhost`
gives the page a real, stable, secure origin and the app behaves exactly as it
does in a browser tab.

The server binds to the loopback address, but the WebView must address it as
`localhost`, **not** the literal `127.0.0.1`: App Transport Security blocks the
numeric form from WKWebView even with an exception domain declared, and the
failure mode is a silent blank page. Since the hostname is part of the origin,
changing it after release would orphan stored data — see the comment in
`src/useStaticServer.ts`.

### Why the port is pinned

A web origin is scheme + host + **port**. The static server defaults to
picking any free port, which would give the WebView a *different origin on
every launch* — and therefore an empty `localStorage` every launch, silently
discarding the user's data. `src/useStaticServer.ts` pins the port and, if it
is taken, walks a short deterministic ladder rather than falling back to a
random port.

### What the native build drops

The embedded bundle is built with `VITE_NATIVE=1`, which omits the PWA layer:
no service worker, no precache manifest, no install or update prompt. The
assets already ship inside the binary, so a service worker would only add a
second, staler cache in front of them, and updates arrive through the App
Store rather than through a "reload to apply" toast. `IS_NATIVE`
(`../src/build-env.ts`) gates the runtime side.

The crawler-facing files (`robots.txt`, `sitemap.xml`, `llms.txt`) and the
`/home` OAuth-consent marketing page are also skipped. `/privacy` is kept —
the side menu links to it as a real in-app navigation.

## Running it

**Expo Go will not work.** The static server is a custom native TurboModule
compiled from C (lighttpd), so this needs a dev build. You also need `cmake`
and `pkg-config` on the build host (`brew install cmake pkg-config`).

```sh
cd native
npm install
npm run ios       # builds the web bundle, then expo run:ios
npm run android
```

`npm run ios` / `npm run android` rebuild `webroot/` first. If you change
anything under `../src`, re-run them — the bundle is copied into the native
project at prebuild time, so a stale `webroot/` means a stale app.

```sh
npm run typecheck
```

## Not yet ported

The old native app had an **iCloud key-value storage backend** (accountless
cross-device sync). It is not in the wrapper: reaching a native module from
inside the WebView needs a `postMessage` bridge, plus a new backend wired
through the web app's storage layer — tracked in #262.

**Cloud sign-in is likely broken here.** The Drive / Dropbox OAuth redirect
targets the web app's own origin, which only exists inside the app process, so
the round trip cannot complete — see #274 before offering those backends on
mobile.

Widgets (#263), deadline notifications (#268) and the rest of the native
backlog are tracked in the issue tracker.
