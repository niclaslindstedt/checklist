// Build-time constants exposed as plain TypeScript values. Vite
// substitutes the underlying `__APP_VERSION__` / `__BUILD_LABEL__`
// globals via the `define` block in `vite.config.ts`. The source of
// truth is `package.json` (version), plus the `GITHUB_RUN_NUMBER` /
// `GITHUB_SHA` env vars GitHub Actions populates for the build-number
// and commit-hash suffixes. Mirrors budget's `utils/build-env.ts`.

// The bare semver from `package.json`, e.g. `0.1.0`.
export const APP_VERSION: string = __APP_VERSION__;

// Short build identifier rendered next to the "checklist" header so you
// can tell at a glance which build is running. Shape:
// `<version>[.<run>][-<slot>][+<commit>]` — `<run>` is the CI run
// number, `<slot>` is `pre` for `/preview/` and `br` for `/branch/`, and
// `<commit>` is the short commit hash. Local builds collapse to just
// `<version>`.
export const BUILD_LABEL: string = __BUILD_LABEL__;

// The name the app calls itself: an unnamed list's header, the settings blurb,
// the privacy page. The phone build carries its store listing's name
// (`APP_DISPLAY_NAME` at build time); the website, the desktop app and a
// plain phone build carry the project's own ("checklist"). See `APP_NAME` in
// `vite.config.ts`.
export const APP_NAME: string = __APP_NAME__;

// True only in the bundle embedded in the native wrapper (`native/`),
// which is served from a loopback origin inside a WebView and ships
// without a service worker. Gates the PWA surfaces — SW registration,
// the update prompt, and the install prompt — that have no meaning when
// updates arrive through the App Store instead.
export const IS_NATIVE: boolean = __NATIVE__;

// True only in the bundle embedded in the desktop shell (`tauri/`), which
// ships without a service worker for the same reason: a new version arrives as
// a new binary. Gates SW registration and the update prompt.
export const IS_SHELL: boolean = __SHELL_BUILD__;

// Where the side menu's Donate entry links — the website's alone, and only
// when `VITE_DONATE_URL` is set (blank hides it rather than linking nowhere).
// The phone app and the desktop app ship without it: a payment link outside
// Apple's is an App Store rejection (guideline 3.1.1), and the listings promise
// nothing is sold. It tests the raw `__NATIVE__` / `__SHELL_BUILD__` defines
// rather than the constants above so that in those builds the expression is a
// literal `undefined` the minifier folds, together with the entry that tests
// it — the URL never reaches the bundle. Hiding it at runtime would still ship
// the link.
export const DONATE_URL: string | undefined =
  __NATIVE__ || __SHELL_BUILD__
    ? undefined
    : import.meta.env.VITE_DONATE_URL?.trim() || undefined;

// Whether this build carries the achievements system — the website's alone.
// The phone app and the desktop app ship without it: no trophy row, no unlock
// toasts, no tour, no Settings switch, and neither the catalog nor its strings
// (the owner's decision for every app build). Like `DONATE_URL` it tests
// the raw defines, so in those builds it is a literal `false` the minifier
// folds, and everything it guards leaves the bundle.
export const ACHIEVEMENTS_BUILT: boolean = !(__NATIVE__ || __SHELL_BUILD__);

// Whether this is the website build — the only one that may point back at
// where the app comes from: the source repository, its issues and releases,
// and the website's own address (`checklist.niclaslindstedt.se`). The phone
// app and the desktop app carry none of it — not in the side menu, the privacy
// page, What's new or the page head (the owner's decision, strictly). Like
// `ACHIEVEMENTS_BUILT` it tests the raw defines, so in those builds it is a
// literal `false` the minifier folds and the strings leave the bundle;
// `scripts/website-only.mjs` refuses a bundle that still carries one.
export const IS_WEBSITE: boolean = !(__NATIVE__ || __SHELL_BUILD__);
