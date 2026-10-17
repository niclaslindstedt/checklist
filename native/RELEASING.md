# Releasing the native app to the App Store and Google Play

This is the step-by-step for shipping the Expo app in this directory to
**Apple's App Store** and **Google Play**. It builds the real native binary
with [EAS Build](https://docs.expo.dev/build/introduction/) and uploads it
with [EAS Submit](https://docs.expo.dev/submit/introduction/).

The app is a **WebView wrapper** around the web app's bundle, embedded and
served offline from the app binary — see [`README.md`](README.md).

Both store identities are already wired in [`app.json`](app.json):

- iOS `ios.bundleIdentifier` and Android `android.package` — both come from
  `APP_BUNDLE_ID`, a repository secret and an EAS environment variable. Unset,
  a build runs as `dev.local.checklist`; a `production` profile without it
  fails rather than uploading under the development id. See
  `native/identifiers.js`.

Build/submit profiles live in [`eas.json`](eas.json). Icons and the splash
image live in [`assets/`](assets), rendered at 1024×1024 from the web app's
source mark (`../public/favicon.svg`) — see "Artwork" below.

> **License note.** The source is `PolyForm-Noncommercial-1.0.0`, which
> governs what others may do with it. The copyright holder is not bound by it
> and sells the App Store build: paid up front, with no in-app purchases and no
> ads.

---

## 0. One-time prerequisites

- **Expo account** — free. `npm i -g eas-cli` then `eas login`.
- **Apple Developer Program** — $99/year, identity verification (can take a
  day or two).
- **Google Play Developer account** — one-time $25, identity verification.
- A **Mac is not required** — EAS builds iOS in the cloud and manages the
  signing certificates for you.

Link this project to an EAS project (writes `extra.eas.projectId` and
`owner` into `app.json`):

```sh
cd native
npm ci
eas init
```

**No Dropbox.** The phone app does not offer Dropbox (the owner's decision):
`native.yml` passes no Dropbox key to the bundle, and the phone build drops one
even if it is set. Its lists stay on the device or, on iOS, in the user's own
iCloud. The Dropbox app's `se.agilator.checklist://oauth` redirect URI is no
longer used by any build.

## 1. Set the marketing version

The user-visible version is the release's: `app.config.js` sets
`expo.version` from the root `package.json`, which the **Release** workflow
bumps when it tags `v<version>`. There is nothing to set here — cut the
release first, then build from it. The per-store build number is handled
automatically — `eas.json` sets `appVersionSource: "remote"` and the
`production` profile has `autoIncrement: true`, so EAS increments the iOS
build number and Android `versionCode` on every production build.

## 2. Artwork

The committed icons in `assets/` are 1024×1024 PNGs rendered from the web
app's source mark (`../public/favicon.svg`) by
[`../scripts/gen-native-icons.mjs`](../scripts/gen-native-icons.mjs) — no
third-party image tooling required (`node scripts/gen-native-icons.mjs` from
the repo root regenerates them):

- `assets/icon.png` — full-bleed mark, opaque RGB (Apple rejects alpha in the
  marketing icon).
- `assets/adaptive-icon.png` — mark padded into the Android safe zone over the
  `#1f2933` theme background.
- `assets/splash.png` — centered mark on `#0f1115`.

If the brand mark in `favicon.svg` changes, re-run the script to keep these in
sync.

## 3. Build

> **Build the embedded web bundle first.** The wrapper has no UI of its own —
> it serves `native/webroot`, produced by `npm run build:native` at the repo
> root. That directory is gitignored, so the root `.easignore` is what keeps it
> in the EAS upload; without the build step the `withWebroot` config plugin
> fails the build with a clear error rather than shipping an empty app.
>
> ```sh
> APP_DISPLAY_NAME="<listing name>" npm --prefix .. run build:native
> ```
>
> `APP_DISPLAY_NAME` is the name the app calls itself inside; set it for this
> build as well as for `eas build`, or the app says "checklist".
>
> The CI workflow below does this automatically.

```sh
# Android App Bundle (.aab) for Play
eas build --platform android --profile production

# iOS build for the App Store
eas build --platform ios --profile production

# …or both at once
eas build --platform all --profile production
```

For a quick install on a device/simulator before going to the stores, use
the `preview` profile (Android APK / iOS simulator build) instead.

### Building from GitHub Actions

You don't have to build from a laptop. Two **manual-only** workflows drive
EAS from CI (they never run on push/PR, so no build is ever queued unless a
maintainer asks — this is the cost control):

- **Native build (EAS)** (`.github/workflows/native.yml`) — dispatch
  with a `platform` (all/android/ios), a `profile`
  (development/preview/production), and an optional `submit` toggle
  (production only). It queues the build on EAS and exits (`--no-wait`), so it
  burns almost no Actions minutes; the compile runs on Expo's servers. With
  `submit: true` it passes `--auto-submit` so EAS submits the finished
  production build to the stores automatically.
- **Native submit (EAS)** (`.github/workflows/native-submit.yml`) — submits an
  already-built binary without spending a build. Submits the latest finished
  build by default, or a specific one via the `build_id` input.

Both require an **`EXPO_TOKEN`** repository secret — create an access token at
`https://expo.dev/accounts/[account]/settings/access-tokens` with access to
this EAS project (`extra.eas.projectId` in `app.json`) and add it under the
repo's *Settings → Secrets and variables → Actions*. Store submission still
needs the credentials wired into `eas.json` → `submit.production` (steps 4–5).

## 4. Google Play submission

1. In the **Play Console**, create the app once (name "checklist", default
   language, free, declare it's an app not a game).
2. Create a **service account** with the *Release Manager* role and download
   its JSON key. Save it as `native/play-service-account.json` (already
   referenced by `eas.json` → keep it **out of git**; add to `.gitignore` if
   you store it here).
3. Submit the build:
   ```sh
   eas submit --platform android --profile production --latest
   ```
   This uploads the latest `.aab` to the **internal** track (set in
   `eas.json`). Promote it to closed/open testing → production from the Play
   Console once it looks good.
4. Complete the Play Console listing: short + full description, 512×512 icon,
   1024×500 feature graphic, ≥2 phone screenshots, content-rating
   questionnaire, and the **Data safety** form. Declare: no data collected by
   us; the lists stay on the device (Android has no iCloud, and the phone app
   offers no Dropbox).
   Point the privacy-policy URL at `https://apps.agilator.se/checklist/privacy/`.

## 5. Apple App Store submission

1. In **App Store Connect**, create the app once and note its **Apple ID**
   (the numeric `ascAppId`). The record exists, and `eas.json` →
   `submit.production.ios` already carries its `ascAppId` and the team's
   `appleTeamId`. `appleId` (the Apple Account's email) stays out of the
   repository: EAS asks for it at submit time, or an App Store Connect API key
   stands in for it.
2. Submit the build:
   ```sh
   eas submit --platform ios --profile production --latest
   ```
   This uploads to **TestFlight**. Add internal testers there to smoke-test
   before review.
3. Complete the App Store Connect listing: description, keywords, screenshots,
   the **App Privacy** "nutrition label" (no tracking; the only sync is the
   user's own iCloud, which the system does), and the URLs:
   - privacy policy: `https://apps.agilator.se/checklist/privacy/`
   - marketing: `https://apps.agilator.se/checklist/`
   - support: `https://apps.agilator.se/checklist/support/`

   The required screenshot sizes are the 6.9″ iPhone (1320×2868) and, since
   `ios.supportsTablet` is true, the 13″ iPad (2064×2752); App Store Connect
   scales each down to the smaller devices in its family. They are produced
   outside this repository and staged into `store/screenshots/` by the listing
   tooling — see [`store/README.md`](store/README.md#the-screenshots). Then
   submit for review.

## 6. Subsequent releases

Cut the release (its version is the app's, step 1), then
`eas build --platform all --profile production` and
`eas submit --platform all --profile production --latest`. Build numbers
auto-increment, so no manual bookkeeping per store.
