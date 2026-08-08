// Build-time only. Loaded through a throwaway Vite SSR server by the
// `prerender-static-routes` plugin in `vite.config.ts`, never bundled for the
// browser — nothing under `src/` imports it, and `preact-render-to-string` is
// a devDependency.
//
// It renders each standalone route to the HTML that ships inside `<div
// id="app">`, so `/home` and `/privacy` arrive as real documents: a crawler
// (or the Google OAuth reviewer reading `/home`) sees the copy without running
// the bundle, and a browser paints it before the bundle has parsed. `main.tsx`
// then hydrates that markup rather than rebuilding it.
//
// The app route (`/`) is not prerendered — see `vite.config.ts`.

// Side-effect import, and load-bearing: `preact/compat` installs the
// `options.vnode` hook that rewrites React-style prop names to the ones the
// DOM actually uses — `strokeWidth` → `stroke-width` and the rest of the SVG
// camelCase set. The browser gets that hook for free because the app imports
// from `"react"`, but nothing in *this* module's graph does at runtime (the
// pages import only components, and type-only imports are erased), so without
// this line the prerendered icons ship with attributes no browser applies and
// every one of them is a hydration mismatch.
import "preact/compat";
import { render } from "preact-render-to-string";

import { StaticRouteView } from "./StaticRouteView.tsx";
import { STATIC_ROUTES, type StaticRoute } from "./static-routes.ts";

// Whether `preact/compat` normalised prop names is a property of which modules
// happen to be loaded in the rendering process, not of anything in this file —
// so the import above is checked rather than trusted. These are the prefixes
// `preact/compat` rewrites (its `options.vnode` hook lower-cases and dashes
// them), carrying the same negative lookaheads for the handful of SVG
// attributes that really are camelCase in the DOM: `textLength`, `markerWidth`,
// `clipPathUnits`, `glyphRef`. `viewBox` and friends never match — they don't
// start with one of these prefixes.
const REACT_STYLE_ATTR =
  /\s(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|letter|lighting|marker(?!H|W|U)|overline|paint|pointer|shape|stop|strikethrough|stroke|text(?!L)|underline|unicode|units|vector|vert|word|writing)[A-Z][A-Za-z]*=/;

/**
 * The offending attribute name, or `null` when the markup is clean.
 * Exported so the rule itself is testable without having to reproduce a
 * module graph in which `preact/compat` never loaded.
 */
export function findReactStyleAttribute(html: string): string | null {
  const match = REACT_STYLE_ATTR.exec(html);
  return match ? match[0].trim().slice(0, -1) : null;
}

/**
 * Static HTML for one standalone route's `#app` contents.
 *
 * Throws if the markup still carries React-style attribute names: the client
 * renders through `preact/compat`, so shipping un-normalised attributes would
 * both break the pre-hydration paint (no browser applies `strokeWidth`) and
 * make every icon a hydration mismatch. Better to fail the build than to
 * publish a page whose icons quietly render wrong for crawlers.
 */
export function renderStaticRoute(route: StaticRoute): string {
  const html = render(<StaticRouteView route={route} />);
  const leaked = findReactStyleAttribute(html);
  if (leaked) {
    throw new Error(
      `checklist-prerender: "${route}" rendered the React-style attribute ` +
        `"${leaked}" — preact/compat's prop normalisation did not run. Is the ` +
        `\`import "preact/compat"\` at the top of this file still there?`,
    );
  }
  return html;
}

/** Every standalone route's markup, keyed by route. */
export function renderStaticRoutes(): Record<StaticRoute, string> {
  return Object.fromEntries(
    STATIC_ROUTES.map((route) => [route, renderStaticRoute(route)]),
  ) as Record<StaticRoute, string>;
}
