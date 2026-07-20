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
| Native ↔ web bridge (`window.__native`) | `src/nativeBridge.ts` |
| Theme → native chrome (status bar, safe-area bands) | `src/nativeTheme.ts` |
| iCloud key-value store (iOS only) | `src/icloud.ts` |
| Widget shared-container host | `src/widgets.ts`, `modules/widget-bridge/` |
| WidgetKit extension (iOS) | `targets/widget/` (`@bacons/apple-targets`) |
| Glance widget (Android) | `widgets/android/`, `plugins/withWidgets.js` |

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

### Startup, splash, and recovery

The native splash is held (`expo-splash-screen`) until the WebView reports its
first paint (`onLoadEnd`) rather than until the server starts — the server
being up says nothing about the page having rendered — so cold start shows the
splash straight through to real content instead of a blank flash or a spinner.
A timeout drops the splash regardless, so a hung load falls through to the
error screen instead of stranding the user.

If the embedded server fails to bind every port in the ladder, the error
screen offers **Try again**, which re-runs the start sequence (reusing an
already-active instance rather than starting a second one, which the library
rejects). The same recovery runs automatically on foreground: iOS closes the
server's listening socket after a stretch in the background, so on resume
`src/useStaticServer.ts` restarts a dead server or resyncs the origin if it was
rebound to a different port. The foreground decision is a pure function in
`src/serverRecovery.ts`, unit-tested from `tests/native/`.

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

### The native ↔ web bridge (iCloud)

The WebView otherwise walls the web app off from native capabilities. A small
bridge crosses that wall:

- `src/nativeBridge.ts` injects `window.__native` into the page *before it
  loads* and answers its calls. The web build reads that object through
  `../src/storage/native-bridge.ts` (`isICloudAvailable()`), so it
  **feature-detects** the capability rather than assuming it from the platform
  — on the web there is no bridge, and on Android there is no `icloud`.
- Each web-side call (`load` / `save` / `remove` / `getRevision` / a change
  subscription) is a `postMessage` request the native side fulfils from
  Apple's `NSUbiquitousKeyValueStore` (`src/icloud.ts`, via
  `react-native-icloudstore`), replying by injecting a resolver back into the
  page. Cross-device edits arrive as `NSUbiquitousKeyValueStore` change
  notifications, forwarded into the page so the list re-reads.

This powers the **iCloud** storage backend (`Settings → Storage`) — the one
account-less sync option, offered only here on iOS. It needs the
`com.apple.developer.ubiquity-kvstore-identifier` entitlement, declared in
`app.json`; Apple queries unused entitlements, so it ships only with this
feature.

### Home Screen widgets

The same bridge carries the Home Screen / Lock Screen widgets. Because a widget
runs in a separate OS process that can't reach the WebView's `localStorage`,
the app mirrors a compact **snapshot** of the active list, its open items, and
what's due today into a shared container the widget reads — an **App Group**
(`group.se.niclaslindstedt.checklist`) on iOS, a shared `SharedPreferences`
file on Android — and reloads the widget timelines on every change. The snapshot
is derived and read-optimised; the WebView storage stays the source of truth.

- `window.__native.widgets` (`src/nativeBridge.ts`) exposes `publish` (write the
  snapshot + reload) and `pending` (drain the interactive check-off widget's
  queued taps), fulfilled by the local `modules/widget-bridge` Expo module
  (`src/widgets.ts`).
- The **iOS** WidgetKit extension is generated from `targets/widget/` by
  `@bacons/apple-targets` during prebuild (progress ring, due-today,
  interactive check-off with App Intents, quick-add + an iOS 18 control).
- The **Android** Glance widget lives in `widgets/android/` and is wired into
  the app project (sources, provider XML, manifest receiver) by
  `plugins/withWidgets.js`, which also adds the App Group entitlement to the
  main iOS app.
- The interactive check-off can't write the store from its own process, so its
  tap **queues** a toggle the app applies through its normal edit path on the
  next foreground — never a second write path.

Widgets open the app via the `checklist://add?list=<id>` / `checklist://open`
deep links, routed into the web app by the wrapper (the `checklist` scheme is
registered from `app.json`).

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

Deadline notifications (#268) and the rest of the native backlog are tracked
in the issue tracker.
