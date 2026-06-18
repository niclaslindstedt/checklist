// Application entry point. Mounts the React tree inside `LanguageRoot`,
// which provides the active language, the shared toast viewport, and the
// PWA update prompt (the prompt's `usePwaUpdate` store registers the
// service worker on first subscribe). The default webfont (JetBrains
// Mono — the `mono` family and the base of the fallback stack) is
// imported statically so it lands in the main bundle and is precached
// for offline first paint; per the local-first invariant, no font is
// fetched from a CDN at runtime.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { LanguageRoot } from "../i18n/LanguageRoot.tsx";
import "../styles.css";
// Only the latin + latin-ext subsets ship — the app's UI text lives
// entirely within them, so the bare entrypoint (which also pulls
// cyrillic / greek / vietnamese) would be pure waste. Mirrors budget.
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-ext-700.css";
import { PrivacyPage } from "../ui/PrivacyPage.tsx";
import { ShowcasePage } from "../ui/ShowcasePage.tsx";
import { App } from "./App.tsx";

const root = document.getElementById("app");
if (!root) throw new Error("missing #app mount point");

// Trivial path-based switch. The build emits `dist/privacy/index.html` and
// `dist/home/index.html` (see the `emit-privacy-alias` / `emit-showcase-alias`
// plugins in `vite.config.ts`) so GitHub Pages serves the same SPA at
// `/privacy/` and `/home/`, and these checks decide which view to mount.
// Deploy slots nest the page one segment deeper (`/preview/privacy/`,
// `/preview/home/`); the suffix checks match both.
const path = window.location.pathname.replace(/\/$/, "");
const isPrivacy = path.endsWith("/privacy");
const isHome = path.endsWith("/home");

createRoot(root).render(
  <StrictMode>
    <LanguageRoot>
      {isHome ? <ShowcasePage /> : isPrivacy ? <PrivacyPage /> : <App />}
    </LanguageRoot>
  </StrictMode>,
);
