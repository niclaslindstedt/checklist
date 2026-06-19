import { readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, type Plugin } from "vitest/config";
import {
  HOME_ROUTE,
  PRIVACY_ROUTE,
  ROUTES,
  SHOWCASE_ROUTE,
  type RouteSeo,
  renderHeadSeo,
  renderLlmsTxt,
  renderRobotsTxt,
  renderSitemap,
  resolveNoscriptBody,
} from "./src/seo/routes";
import {
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
} from "./src/seo/siteConfig";

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

// Per-slot PWA display name so the preview and branch slots install as
// visibly separate apps on the home screen rather than three identically
// named "checklist" tiles the user can't tell apart. The W3C identity
// (`id`/`scope`/`start_url`) is already per-slot below; this just labels
// the tile to match.
const PWA_NAME =
  base === "/preview/"
    ? `${SITE_NAME} (preview)`
    : base === "/branch/"
      ? `${SITE_NAME} (branch)`
      : SITE_NAME;
const PWA_SHORT_NAME =
  base === "/preview/"
    ? `${SITE_NAME} pre`
    : base === "/branch/"
      ? `${SITE_NAME} br`
      : SITE_NAME;

// Keep each slot's service worker inside its own base path. The default
// `navigateFallback` (index.html for any in-scope navigation) means the
// production SW, scoped to `/`, would otherwise claim `/preview/` and
// `/branch/` navigations and serve the production app shell at those
// URLs — so a PWA installed from `/preview/` silently runs production.
// The slot patterns also match the slash-less `/preview` / `/branch`
// spellings: GitHub Pages 301-redirects those to the trailing-slash URL,
// but the SW intercepts the navigation before the network, so a denylist
// that only knew `/preview/` would still hand back the wrong index.html.
// Workbox tests these against `url.pathname + url.search`, hence the `\?`
// alternative. A non-root build denies everything outside its own base.
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAVIGATE_FALLBACK_DENYLIST =
  base === "/"
    ? [/^\/preview(?:\/|\?|$)/, /^\/branch(?:\/|\?|$)/]
    : [new RegExp(`^/(?!${escapeRegex(base.slice(1))})`)];

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

// Splice a route's SEO into the HEAD_SEO / NOSCRIPT marker blocks of an
// `index.html` string and re-emit the markers so a later pass (the privacy
// alias) can splice again. The single source of truth for the copy is
// `src/seo/routes.ts`. Throws loudly if the markers were dropped from
// `index.html` rather than silently shipping a route with no <head> SEO.
const HEAD_SEO_RE =
  /<!-- HEAD_SEO_START[\s\S]*?-->[\s\S]*?<!-- HEAD_SEO_END -->/;
const NOSCRIPT_RE =
  /<!-- NOSCRIPT_START[\s\S]*?-->[\s\S]*?<!-- NOSCRIPT_END -->/;

function spliceRouteSeo(html: string, route: RouteSeo): string {
  if (!HEAD_SEO_RE.test(html)) {
    throw new Error(
      "checklist-seo: HEAD_SEO markers missing from index.html — cannot " +
        "inject per-route <head> SEO. Did index.html drop the " +
        "<!-- HEAD_SEO_START --> / <!-- HEAD_SEO_END --> pair?",
    );
  }
  if (!NOSCRIPT_RE.test(html)) {
    throw new Error(
      "checklist-seo: NOSCRIPT markers missing from index.html — cannot " +
        "inject the per-route fallback body.",
    );
  }
  const head =
    `<!-- HEAD_SEO_START (${route.path}) -->\n    ` +
    renderHeadSeo(route) +
    `\n    <!-- HEAD_SEO_END -->`;
  const noscript =
    `<!-- NOSCRIPT_START (${route.path}) -->\n        ` +
    resolveNoscriptBody(route) +
    `\n        <!-- NOSCRIPT_END -->`;
  return html.replace(HEAD_SEO_RE, head).replace(NOSCRIPT_RE, noscript);
}

// Fill the homepage's HEAD_SEO / NOSCRIPT blocks from `HOME_ROUTE`. Runs in
// `transformIndexHtml` so the meta is present in both the dev server and the
// production build — `index.html` itself carries only empty markers, so the
// SEO copy never duplicates across `index.html` and `src/seo/`.
function injectHomeSeo(): Plugin {
  return {
    name: "inject-home-seo",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => spliceRouteSeo(html, HOME_ROUTE),
    },
  };
}

// Mirror the built `index.html` to `privacy/index.html` so GitHub Pages
// serves the SPA from the clean URL `/privacy/` (and `/preview/privacy/`,
// …). The app's `main.tsx` reads `location.pathname` and mounts the
// privacy page there; the copied HTML loads the same hashed asset URLs
// (they are origin-absolute), so no rewrite is needed. The HEAD_SEO /
// NOSCRIPT blocks (filled with the homepage payload by `injectHomeSeo`) are
// re-spliced with `PRIVACY_ROUTE` so the alias gets its own title, canonical,
// and fallback body instead of inheriting the homepage's. Runs late so the
// PWA plugin's manifest-link injection is already baked into the source.
function emitPrivacyAlias(): Plugin {
  return {
    name: "emit-privacy-alias",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index && index.type === "asset") {
        this.emitFile({
          type: "asset",
          fileName: "privacy/index.html",
          source: spliceRouteSeo(String(index.source), PRIVACY_ROUTE),
        });
      }
    },
  };
}

// Mirror the built `index.html` to `home/index.html` so GitHub Pages serves
// the SPA from the clean URL `/home/` (and `/preview/home/`, …). The app's
// `main.tsx` reads `location.pathname` and mounts the showcase page there;
// the copied HTML loads the same origin-absolute hashed asset URLs, so no
// rewrite is needed. The HEAD_SEO / NOSCRIPT blocks are re-spliced with
// `SHOWCASE_ROUTE` so the alias gets its own title, canonical, and fallback
// body instead of inheriting the homepage's. Runs late so the PWA plugin's
// manifest-link injection is already baked into the source.
function emitShowcaseAlias(): Plugin {
  return {
    name: "emit-showcase-alias",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index && index.type === "asset") {
        this.emitFile({
          type: "asset",
          fileName: "home/index.html",
          source: spliceRouteSeo(String(index.source), SHOWCASE_ROUTE),
        });
      }
    },
  };
}

// Emit the site-wide discovery files (§11.3.6) from the same `src/seo/`
// source of truth as the head injector: sitemap.xml + llms.txt list every
// route, robots.txt advertises the sitemap and keeps the non-canonical
// deploy slots out of the index. Emitted via the bundle so they land in the
// slot root alongside `index.html`.
function emitSeoDiscoveryFiles(): Plugin {
  return {
    name: "emit-seo-discovery-files",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: renderSitemap(ROUTES),
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: renderRobotsTxt(),
      });
      this.emitFile({
        type: "asset",
        fileName: "llms.txt",
        source: renderLlmsTxt(ROUTES),
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
        "favicon-mark.svg",
        "favicon.ico",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        id: base,
        scope: base,
        start_url: base,
        name: PWA_NAME,
        short_name: PWA_SHORT_NAME,
        description: SITE_DESCRIPTION,
        theme_color: "#1f2933",
        background_color: "#1f2933",
        display: "standalone",
        orientation: "any",
        lang: SITE_LANGUAGE,
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
        // Never let this slot's SW serve another slot's app shell via the
        // navigation fallback (see NAVIGATE_FALLBACK_DENYLIST above).
        navigateFallbackDenylist: NAVIGATE_FALLBACK_DENYLIST,
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
    injectHomeSeo(),
    emitVersionJson(),
    emitShowcaseAlias(),
    emitPrivacyAlias(),
    emitSeoDiscoveryFiles(),
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
