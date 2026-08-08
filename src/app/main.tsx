// Application entry point. Mounts the component tree inside `LanguageRoot`,
// which provides the active language, the shared toast viewport, and the
// PWA update prompt (the prompt's `usePwaUpdate` store registers the
// service worker on first subscribe). The default webfont (JetBrains
// Mono — the `mono` family and the base of the fallback stack) is
// imported statically so it lands in the main bundle and is precached
// for offline first paint; per the local-first invariant, no font is
// fetched from a CDN at runtime.

import { StrictMode, type ReactNode } from "react";
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
import { warmDeferred } from "../ui/deferred.tsx";
import { App } from "./App.tsx";
import { staticRouteFor } from "./static-routes.ts";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app mount point");

// Trivial path-based switch. The build emits `dist/privacy/index.html` and
// `dist/home/index.html` (see the `emit-privacy-alias` / `emit-showcase-alias`
// plugins in `vite.config.ts`) so GitHub Pages serves the same SPA at
// `/privacy/` and `/home/`, and `staticRouteFor` decides which view to mount
// (it also handles the deploy slots, which nest the page one segment deeper).
const staticRoute = staticRouteFor(window.location.pathname);

// Mount whatever this URL resolves to, then adopt a prerendered document
// rather than throwing it away and rebuilding. `data-prerendered` has to name
// *this* route for hydration to be safe: a service worker holding a shell from
// another route, or the dev server (which prerenders nothing), leaves it
// absent or mismatched, and a clean client render is the correct answer there.
function mount(tree: ReactNode): void {
  if (staticRoute && root!.dataset.prerendered === staticRoute) {
    hydrateRoot(root!, tree);
  } else {
    createRoot(root!).render(tree);
  }
}

if (staticRoute) {
  // The standalone pages live in their own chunk — the app route never loads
  // them, and on their own routes the prerendered markup is already on screen
  // and readable while this resolves. They also mount bare, with no
  // `LanguageRoot`: they are English-only, consume nothing it provides, and
  // keeping them free of its browser-only work is what lets the build render
  // them ahead of time. See `StaticRouteView`.
  void import("./StaticRouteView.tsx").then(({ StaticRouteView }) => {
    mount(<StaticRouteView route={staticRoute} />);
  });
} else {
  mount(
    <StrictMode>
      <LanguageRoot>
        <App />
      </LanguageRoot>
    </StrictMode>,
  );
  // Pull the on-demand chunks (modals, pickers) in during idle time, so the
  // split never costs a stall on the tap that needs one. Only on the app
  // route — the standalone pages open none of them.
  warmDeferred();
}
