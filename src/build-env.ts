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

// True only in the bundle embedded in the native wrapper (`native/`),
// which is served from a loopback origin inside a WebView and ships
// without a service worker. Gates the PWA surfaces — SW registration,
// the update prompt, and the install prompt — that have no meaning when
// updates arrive through the App Store instead.
export const IS_NATIVE: boolean = __NATIVE__;
