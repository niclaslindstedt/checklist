// Application entry point. Mounts the component tree inside `LanguageRoot`,
// which provides the active language, the shared toast viewport, and the
// PWA update prompt (the prompt's `usePwaUpdate` store registers the
// service worker on first subscribe). The default webfont (JetBrains
// Mono — the `mono` family and the base of the fallback stack) is
// imported statically so it lands in the main bundle and is precached
// for offline first paint; per the local-first invariant, no font is
// fetched from a CDN at runtime.

import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { LanguageRoot } from "../i18n/LanguageRoot.tsx";
import "../styles.css";
// Only the latin + latin-ext subsets ship — the app's UI text lives
// entirely within them, so the bare entrypoint (which also pulls
// cyrillic / greek / vietnamese) would be pure waste. Mirrors budget.
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-ext-700.css";
import { App } from "./App.tsx";
import { StaticRouteView } from "./StaticRouteView.tsx";
import { staticRouteFor } from "./static-routes.ts";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app mount point");

// Trivial path-based switch. The build emits `dist/privacy/index.html` and
// `dist/home/index.html` (see the `emit-privacy-alias` / `emit-showcase-alias`
// plugins in `vite.config.ts`) so GitHub Pages serves the same SPA at
// `/privacy/` and `/home/`, and `staticRouteFor` decides which view to mount
// (it also handles the deploy slots, which nest the page one segment deeper).
const staticRoute = staticRouteFor(window.location.pathname);

// The standalone pages mount bare — no `LanguageRoot`. They are English-only
// and consume nothing it provides, and keeping them free of its browser-only
// work is what lets the build render them to HTML ahead of time. See
// `StaticRouteView`.
const tree = staticRoute ? (
  <StaticRouteView route={staticRoute} />
) : (
  <StrictMode>
    <LanguageRoot>
      <App />
    </LanguageRoot>
  </StrictMode>
);

// A prerendered document already holds this route's markup, so adopt it rather
// than throw it away and rebuild. `data-prerendered` has to name *this* route
// for that to be safe: a service worker holding a shell from another route, or
// the dev server (which prerenders nothing), leaves it absent or mismatched,
// and a clean client render is the correct answer there.
if (staticRoute && root.dataset.prerendered === staticRoute) {
  hydrateRoot(root, tree);
} else {
  createRoot(root).render(tree);
}
