/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Build-time constants injected via `vite.config.ts`'s `define` block;
// consumed through `src/build-env.ts`.
//
// `__APP_VERSION__` is the bare semver from `package.json`.
// `__BUILD_LABEL__` is the short build identifier rendered in the header
// — `<version>[.<run>][-<slot>][+<commit>]`, collapsing to just
// `<version>` for local builds.
declare const __APP_VERSION__: string;
declare const __BUILD_LABEL__: string;

// Optional build-time env: the URL the header menu's "Donate" entry
// links to. Unset (or blank) hides the entry entirely. Set it at build
// time, e.g. in `.env` or the CI environment.
interface ImportMetaEnv {
  readonly VITE_DONATE_URL?: string;
  // Dropbox app key (PKCE public client). Unset disables the Dropbox
  // storage backend in the settings picker. See
  // `src/storage/dropbox/index.ts`.
  readonly VITE_DROPBOX_APP_KEY?: string;
  // Google OAuth client id (GIS token client). Unset disables the
  // Google Drive storage backend. See `src/storage/gdrive/index.ts`.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
