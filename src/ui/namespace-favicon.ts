// Resolves the browser-tab favicon to the active namespace's glyph. When a
// namespace has picked an icon, that glyph (in the namespace's accent colour)
// stands in for the bundled checklist mark in the tab; without one the bare,
// background-less check (`favicon-mark.svg`) is used.

import type { Namespace } from "../storage/namespaces.ts";
import { isGlyphName, namespaceGlyphDataUri } from "./glyphs.ts";

// The bundled mark's check colour, used to tint a glyph that was given an
// icon but no explicit colour so it still reads as "the app, re-badged".
const DEFAULT_GLYPH_COLOR = "#34d399";

/**
 * The bare check with no background, for the browser-tab favicon. The PWA
 * app icons keep their opaque badge (generated from `favicon.svg`); only
 * the in-tab favicon drops the background.
 */
function bundledFaviconMark(): string {
  return `${import.meta.env.BASE_URL}favicon-mark.svg`;
}

/**
 * The browser-tab favicon `src` for a namespace: its glyph as a data URI
 * when one is chosen, otherwise the background-less bundled check.
 */
export function namespaceFaviconSrc(ns: Namespace | undefined): string {
  if (ns && isGlyphName(ns.glyph)) {
    return namespaceGlyphDataUri(ns.glyph, ns.color ?? DEFAULT_GLYPH_COLOR);
  }
  return bundledFaviconMark();
}

/**
 * Point the browser-tab favicon at `href`. Reuses the existing
 * `image/svg+xml` icon link from `index.html`, creating one only if it's
 * somehow absent.
 */
export function applyFaviconHref(href: string): void {
  if (typeof document === "undefined") return;
  let link = document.head.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"]',
  );
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    document.head.appendChild(link);
  }
  link.href = href;
}
