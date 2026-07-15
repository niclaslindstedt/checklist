# Releasing the native app to the App Store and Google Play

This is the step-by-step for shipping the Expo app in this directory to
**Apple's App Store** and **Google Play**. It builds the real native binary
with [EAS Build](https://docs.expo.dev/build/introduction/) and uploads it
with [EAS Submit](https://docs.expo.dev/submit/introduction/) — we do **not**
wrap the web PWA in a web-view shell.

Both store identities are already wired in [`app.json`](app.json):

- iOS `ios.bundleIdentifier` — `se.niclaslindstedt.checklist`
- Android `android.package` — `se.niclaslindstedt.checklist`

Build/submit profiles live in [`eas.json`](eas.json). Icons and the splash
image live in [`assets/`](assets), rendered at 1024×1024 from the web app's
source mark (`../public/favicon.svg`) — see "Artwork" below.

> **License note.** The project is `PolyForm-Noncommercial-1.0.0`. Keep both
> listings **free** and non-commercial — no paid app, no in-app purchases, no
> ads — to stay within the license.

---

## 0. One-time prerequisites

- **Expo account** — free. `npm i -g eas-cli` then `eas login`.
- **Apple Developer Program** — $99/year, identity verification (can take a
  day or two). Needed for the iCloud key-value entitlement this app declares.
- **Google Play Developer account** — one-time $25, identity verification.
- A **Mac is not required** — EAS builds iOS in the cloud and manages the
  signing certificates for you.

Link this project to an EAS project (writes `extra.eas.projectId` and
`owner` into `app.json`):

```sh
cd native
npm install
eas init
```

## 1. Set the marketing version

`app.json` → `expo.version` is the user-visible version (e.g. `1.0.0`). Bump
it for each store release. The per-store build number is handled
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

- **Native build (EAS)** (`.github/workflows/native-build.yml`) — dispatch
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
   us; cloud sync only when the user opts into a backend (iCloud on iOS).
   Point the privacy-policy URL at `https://checklist.niclaslindstedt.se/privacy`.

## 5. Apple App Store submission

1. In **App Store Connect**, create the app once and note its **Apple ID**
   (the numeric `ascAppId`). Fill `appleId`, `ascAppId`, and `appleTeamId`
   in `eas.json` → `submit.production.ios` (or pass them at submit time).
2. Submit the build:
   ```sh
   eas submit --platform ios --profile production --latest
   ```
   This uploads to **TestFlight**. Add internal testers there to smoke-test
   before review.
3. Complete the App Store Connect listing: description, keywords, screenshots
   for the required device sizes (6.7", 6.5", and iPad since
   `ios.supportsTablet` is true), the **App Privacy** "nutrition label" (no
   tracking; iCloud sync is the user's own iCloud), and the privacy-policy
   URL above. Then submit for review.

   > **Guideline 4.2 ("minimum functionality").** Apple scrutinizes apps that
   > feel like a wrapped website. This app is genuinely native (React Native
   > views, on-device + iCloud storage, offline-first), so lead with that in
   > the review notes. The web-only features not yet ported (cloud backends,
   > themes, sharing, templates UI — see [`README.md`](README.md)) don't block
   > a release, but a fuller feature set lowers rejection risk.

## 6. Subsequent releases

Bump `expo.version` (step 1), `eas build --platform all --profile production`,
then `eas submit --platform all --profile production --latest`. Build numbers
auto-increment, so no manual bookkeeping per store.
