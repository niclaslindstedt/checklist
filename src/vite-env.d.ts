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
