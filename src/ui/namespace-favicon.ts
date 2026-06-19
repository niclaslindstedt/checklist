// Resolves the app's logo / favicon to the active namespace's glyph. When
// a namespace has picked an icon, that glyph (in the namespace's accent
// colour) stands in for the bundled checklist mark — both in the header
// wordmark slot and as the browser-tab favicon. Without a glyph the bundled
// mark is used, but the two slots draw it differently: the header wordmark
// keeps the dark rounded badge (`favicon.svg`), while the browser-tab
// favicon uses the bare, background-less check (`favicon-mark.svg`).

import type { Namespace } from "../storage/namespaces.ts";
import { isGlyphName, namespaceGlyphDataUri } from "./glyphs.ts";

// The bundled mark's check colour, used to tint a glyph that was given an
// icon but no explicit colour so it still reads as "the app, re-badged".
const DEFAULT_GLYPH_COLOR = "#34d399";

/** The badged app mark (dark rounded background), for the header wordmark. */
function bundledLogo(): string {
  return `${import.meta.env.BASE_URL}favicon.svg`;
}

/**
 * The bare check with no background, for the browser-tab favicon. The PWA
 * app icons keep their opaque badge (generated from `favicon.svg`); only
 * the in-tab favicon drops the background.
 */
function bundledFaviconMark(): string {
  return `${import.meta.env.BASE_URL}favicon-mark.svg`;
}

/**
 * The logo `src` for a namespace: its glyph as a data URI when one is
 * chosen, otherwise the bundled badged mark. A namespace with only a colour
 * (no glyph) keeps the bundled mark — the logo is re-badged only when a
 * glyph is picked.
 */
export function namespaceLogoSrc(ns: Namespace | undefined): string {
  if (ns && isGlyphName(ns.glyph)) {
    return namespaceGlyphDataUri(ns.glyph, ns.color ?? DEFAULT_GLYPH_COLOR);
  }
  return bundledLogo();
}

/**
 * The browser-tab favicon `src` for a namespace: its glyph as a data URI
 * when one is chosen, otherwise the background-less bundled check. Mirrors
 * {@link namespaceLogoSrc} except for the no-glyph default, where the tab
 * favicon shows the bare mark rather than the badged logo.
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
