import { readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, type Plugin } from "vitest/config";

// The GitHub Pages base path is injected by the `pages.yml` workflow via
// VITE_BASE so the same bundle works at `/`, `/checklist/`, or any subpath.
const base = process.env.VITE_BASE ?? "/";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

// Short build identifier rendered next to the "checklist" header and
// surfaced in the update prompt so you can tell at a glance which build
// is running. Shape: `<pkg.version>[.<run>][-<slot>][+<commit>]`:
//
//   - `<run>`    — the `GITHUB_RUN_NUMBER` GitHub Actions populates
//                  automatically (omitted for local builds).
//   - `<slot>`   — `pre` for the `/preview/` slot, `br` for `/branch/`,
//                  omitted for the production `/` slot.
//   - `<commit>` — the short `GITHUB_SHA` as semver build metadata after
//                  the `+` (omitted for local builds).
//
// e.g. `0.1.0` for a local build, `0.1.0.42-pre+a1b2c3d` for a CI
// preview build. Mirrors budget's BUILD_LABEL, extended with the commit
// hash.
const GITHUB_RUN_NUMBER = process.env.GITHUB_RUN_NUMBER;
const COMMIT_HASH = (process.env.GITHUB_SHA ?? "").slice(0, 7);
const BUILD_SLOT =
  base === "/preview/" ? "pre" : base === "/branch/" ? "br" : "";

// Per-slot Workbox precache cache id. The three Pages slots share one
// origin, so a slot-specific id keeps each deploy's precache cache
// (`<cacheId>-precache-v2-<scope>`) distinct — the download-progress
// tracker in `usePwaUpdate` opens this slot's cache by name to measure
// install progress without counting another slot's bytes. Must stay in
// sync with `cacheIdForBase` in `src/pwa/usePwaUpdate.ts`.
const CACHE_ID =
  base === "/preview/"
    ? "checklist-preview"
    : base === "/branch/"
      ? "checklist-branch"
      : "checklist";
const BUILD_LABEL =
  pkg.version +
  (GITHUB_RUN_NUMBER ? `.${GITHUB_RUN_NUMBER}` : "") +
  (BUILD_SLOT ? `-${BUILD_SLOT}` : "") +
  (COMMIT_HASH ? `+${COMMIT_HASH}` : "");

// Emit a tiny `version.json` carrying this build's BUILD_LABEL into the
// slot root (`/version.json`, `/preview/version.json`, …). The running
// page knows only its OWN BUILD_LABEL, so the update prompt can't name
// the *incoming* build from anything in the loaded bundle. It fetches
// this file (cache-bypassed) when the workbox `waiting` event fires to
// learn the version it's about to upgrade to. Deliberately kept out of
// precache (`json` isn't in `workbox.globPatterns`) so the active SW
// lets the fetch reach the network and return the freshly-deployed file.
function emitVersionJson(): Plugin {
  return {
    name: "emit-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version: BUILD_LABEL })}\n`,
      });
    },
  };
}

// Emit a `precache-manifest.json` listing every asset the service worker
// precaches and its on-disk byte size, plus the total. The running app
// fetches it (cache-bypassed, like `version.json`) when a new SW starts
// installing, so it can turn "files added to the precache cache so far"
// into a real percentage and fill the header "checklist" wordmark like a
// power bar while the update downloads. See `src/pwa/usePwaUpdate.ts` for
// the consumer.
//
// The list is read back out of the generated `dist/sw.js`
// (vite-plugin-pwa inlines the workbox precache manifest there as
// `precacheAndRoute([{url,revision},...])`) rather than re-globbing
// `dist/` ourselves, so the denominator matches exactly what workbox
// actually precaches — globIgnores, the SW files, and on-demand chunks
// all already filtered out. Keys are the request *pathnames* the browser
// stores in the precache cache (`<base><url>`); the consumer compares
// cache entries by pathname, which sidesteps the `?__WB_REVISION__=`
// query workbox appends to revisioned entries.
//
// Runs in `closeBundle` after `VitePWA` (itself `enforce: "post"`) has
// written `dist/sw.js`, and the emitted JSON lands after the workbox glob
// ran, so it is itself left out of precache — exactly like `version.json`.
function emitPrecacheManifest(): Plugin {
  return {
    name: "emit-precache-manifest",
    apply: "build",
    enforce: "post",
    closeBundle() {
      const swPath = fileURLToPath(new URL("./dist/sw.js", import.meta.url));
      let sw: string;
      try {
        sw = readFileSync(swPath, "utf8");
      } catch {
        // No generated SW (e.g. PWA disabled) — nothing to measure.
        return;
      }
      const callIdx = sw.indexOf("precacheAndRoute([");
      if (callIdx === -1) return;
      const arrStart = sw.indexOf("[", callIdx);
      const arrEnd = sw.indexOf("}]", arrStart);
      if (arrStart === -1 || arrEnd === -1) return;
      const arr = sw.slice(arrStart, arrEnd + 2);
      const urls = [...arr.matchAll(/url:"([^"]+)"/g)]
        .map((m) => m[1])
        .filter((u): u is string => typeof u === "string");

      // Assets in `includeAssets` (favicons / iOS icon) can appear twice
      // in the precache manifest — once explicitly, once via
      // `globPatterns` — but resolve to a single cache entry, so key by
      // pathname and let the map dedupe both the entry and its bytes.
      const assets: Record<string, number> = {};
      for (const url of urls) {
        // Cache keys resolve `url` against the SW scope (`base`), so the
        // stored pathname is `<base><url>` with no double slash.
        const path = base + url.replace(/^\//, "");
        if (path in assets) continue;
        try {
          assets[path] = statSync(
            fileURLToPath(
              new URL(`./dist/${url.replace(/^\//, "")}`, import.meta.url),
            ),
          ).size;
        } catch {
          // Listed in the manifest but absent on disk — skip it.
        }
      }
      const totalBytes = Object.values(assets).reduce((a, b) => a + b, 0);

      writeFileSync(
        fileURLToPath(
          new URL("./dist/precache-manifest.json", import.meta.url),
        ),
        `${JSON.stringify({ totalBytes, assets })}\n`,
        "utf8",
      );
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // `UpdateToast` registers the SW itself via `workbox-window` (so it
      // can pass `updateViaCache: "none"`) and the new build parks in the
      // `waiting` state until the user clicks Reload — no silent swap, no
      // auto-injected `<script>`.
      registerType: "prompt",
      injectRegister: null,
      // Static assets copied verbatim from `public/` that the service
      // worker should also precache so the install / favicon / iOS
      // home-screen icon resolve offline. The `icons` array below is
      // precached automatically via the workbox glob; these are the
      // extras that aren't manifest icons.
      includeAssets: [
        "favicon.svg",
        "favicon.ico",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        id: base,
        scope: base,
        start_url: base,
        name: "checklist",
        short_name: "checklist",
        description:
          "A local-first PWA checklist app with template and sharing support.",
        theme_color: "#1f2933",
        background_color: "#1f2933",
        display: "standalone",
        orientation: "any",
        lang: "en",
        categories: ["productivity", "utilities"],
        // Generated by `make icons` from `public/favicon.svg`; see
        // `pwa-assets.config.ts`. Keep this list in sync with the PNGs
        // committed under `public/`.
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Slot-specific precache cache name so the three Pages slots
        // sharing this origin don't measure each other's bytes; the
        // download-progress tracker in `usePwaUpdate` opens it by this id.
        cacheId: CACHE_ID,
        // Precache the app shell: JS, CSS, fonts, icons, and the HTML
        // entry. Source maps stay on the network — they don't need to
        // be available offline.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
        // Source maps stay on the network. The non-default webfont
        // families (Inter / Source Serif 4 / OpenDyslexic) load on demand
        // when the user picks them in Appearance (see `src/theme/fonts.ts`)
        // and HTTP-cache afterwards, so keep them out of the precache —
        // only JetBrains Mono (the default face) ships in the app shell.
        globIgnores: [
          "**/*.map",
          "**/inter-*.woff2",
          "**/source-serif-4-*.woff2",
          "**/opendyslexic-*.woff2",
        ],
        cleanupOutdatedCaches: true,
        // App shell is precached; cloud-storage hosts use networkFirst.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === "www.googleapis.com" ||
              url.hostname === "api.dropboxapi.com" ||
              url.hostname === "content.dropboxapi.com",
            handler: "NetworkFirst",
            options: { cacheName: "cloud-storage" },
          },
        ],
      },
    }),
    emitVersionJson(),
    emitPrecacheManifest(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_LABEL__: JSON.stringify(BUILD_LABEL),
  },
  test: {
    // Domain/storage/share tests run in node. UI tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
