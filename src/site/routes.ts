// Per-route head metadata and the renderers that turn it into the HTML
// `<head>` payload and the `<noscript>` fallback body. Consumed by the
// build-time head injector and the route splicer in `vite.config.ts`: the
// homepage block in `index.html` (between the HEAD_ROUTE_START /
// HEAD_ROUTE_END markers) is filled from `HOME_ROUTE`, and
// `dist/privacy/index.html` is spliced from `PRIVACY_ROUTE`. Add a new route
// here and wire its alias in `vite.config.ts` to extend. No canonical,
// JSON-LD, sitemap or llms.txt — there is no SEO, by owner decision.

import {
  DEFAULT_OG_IMAGE,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
  SITE_NAME,
  TWITTER_CARD,
  absoluteUrl,
} from "./siteConfig.ts";

export type OgType = "website" | "article";

export interface RouteHead {
  // URL path the route is served at, with trailing slash on sub-routes.
  // Used as the og:url suffix and the alias output directory.
  path: string;
  title: string;
  description: string;
  // Social-card title; falls back to `title` when omitted.
  ogTitle?: string;
  ogType: OgType;
  // Per-route <noscript> body override (pure HTML). Omit to derive a
  // generic body from `title` + `description`.
  noscriptBody?: string;
}

// HTML-escape a string destined for an attribute value or text node.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- <noscript> fallback ---------------------------------------------------
// A pre-hydration body shown to clients that don't run the SPA bundle
// (crawlers, link unfurlers, no-JS readers). main.tsx replaces #app the
// moment the bundle runs, so normal visitors never see it. The copy mirrors
// the meta description so the body and the description never disagree.
// Inline single quotes in the style so the fragment stays valid when spliced
// into the alias.
//
// This is the fallback for `/` only. The standalone routes ship prerendered
// markup instead (see `spliceAppShell` below), which is a strictly better
// answer for the same readers — but they still resolve a body here, because
// the dev server serves `index.html` unprerendered.
const NOSCRIPT_STYLE_MAIN = `font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem; color: #c8c8c8; background: #1f2933; line-height: 1.55;`;
const NOSCRIPT_STYLE_H1 = `font-size: 1.5rem; color: #e5c07b; margin: 0 0 1rem;`;

function noscript(h1: string, paragraphs: string[]): string {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n          ");
  return [
    `<main style="${NOSCRIPT_STYLE_MAIN}">`,
    `  <h1 style="${NOSCRIPT_STYLE_H1}">${esc(h1)}</h1>`,
    `  ${body}`,
    `  <p><a href="/">Back to ${SITE_NAME}</a></p>`,
    `</main>`,
  ].join("\n        ");
}

export function resolveNoscriptBody(route: RouteHead): string {
  if (route.noscriptBody) return route.noscriptBody;
  return noscript(route.title, [
    esc(route.description),
    "This page needs JavaScript to render fully. Enable JavaScript and reload.",
  ]);
}

// --- prerendered app shell -------------------------------------------------
// `index.html` ships `<div id="app">` holding only the <noscript> fallback
// above. For a route the build can render ahead of time (the standalone
// `/home` and `/privacy` pages — see `src/app/prerender.tsx`), this swaps that
// whole container for one holding the page's real markup.
//
// The <noscript> body goes away rather than sitting alongside: it exists to
// give a non-executing client *something* to read, and with the page itself in
// the document a no-JS visitor would otherwise read the summary and the page,
// one after the other. What replaces it is strictly better copy anyway.
//
// `data-prerendered` names the route the markup belongs to. `main.tsx` reads
// it and only hydrates when it matches the route it is about to mount, so a
// stale cached shell (or the dev server, which prerenders nothing) falls back
// to a clean client render instead of hydrating onto the wrong DOM.
const APP_SHELL_RE = /<div id="app">[\s\S]*?<\/noscript>\s*<\/div>/;

export function spliceAppShell(
  html: string,
  route: string,
  markup: string,
): string {
  if (!APP_SHELL_RE.test(html)) {
    throw new Error(
      'checklist-head: could not find the `<div id="app">` shell (with its ' +
        "<noscript> fallback) to replace with prerendered markup for " +
        `"${route}". Did index.html change shape?`,
    );
  }
  return html.replace(
    APP_SHELL_RE,
    `<div id="app" data-prerendered="${esc(route)}">${markup}</div>`,
  );
}

// --- routes ---------------------------------------------------------------
export const HOME_ROUTE: RouteHead = {
  path: "/",
  title: `${SITE_NAME} — local-first checklist & template PWA`,
  ogTitle: `${SITE_NAME} — local-first checklist PWA`,
  description: SITE_DESCRIPTION,
  ogType: "website",
};

export const PRIVACY_ROUTE: RouteHead = {
  path: "/privacy/",
  title: `Privacy — ${SITE_NAME}`,
  description:
    "checklist privacy: local-first by default — no account, no cookies, no " +
    "analytics, no tracking. Optional Dropbox sync only when " +
    "you connect it.",
  ogType: "article",
  noscriptBody: noscript("Privacy policy — checklist", [
    "checklist is a local-first checklist app served as a static site. It runs entirely in your browser: there is no backend of our own, no account, no cookies, and no analytics or tracking. By default your lists stay on your device and never leave it. You can optionally connect a cloud backend (Dropbox) to sync them across your own devices — only then are your lists sent to that one provider, at your explicit request. The project authors never receive them.",
    "The full privacy policy needs JavaScript to render. Enable JavaScript and reload, or read the source on GitHub.",
  ]),
};

// The `/home` showcase: a no-login marketing page that identifies the app,
// describes what it does, and explains why it requests Dropbox access —
// the page linked as the "app homepage" on the OAuth consent screen.
// Served from `dist/home/index.html` by the `emit-showcase-alias` plugin in
// `vite.config.ts`; `main.tsx` mounts `ShowcasePage` for the `/home` path.
export const SHOWCASE_ROUTE: RouteHead = {
  path: "/home/",
  title: "checklist — what it does & why it asks for access",
  description:
    "What checklist does, where your data lives, and why it requests " +
    "Dropbox access — only when you turn on optional cloud sync.",
  ogType: "website",
  noscriptBody: noscript("checklist — a local-first checklist PWA", [
    "checklist is a fast, local-first checklist and template app that runs entirely in your browser, works offline, and needs no account. By default your lists are stored only on your device and never leave it. You can optionally turn on cloud sync, at which point — and only then — the app asks for access to an app-specific folder in your Dropbox, purely to save and load your own lists across your devices.",
    "This page needs JavaScript to render fully. Enable JavaScript and reload.",
  ]),
};

export const ROUTES: readonly RouteHead[] = [
  HOME_ROUTE,
  SHOWCASE_ROUTE,
  PRIVACY_ROUTE,
];

// --- <head> renderer -------------------------------------------------------
// Renders the route-specific <head> payload (everything between the
// HEAD_ROUTE markers): title, description, and the OG + Twitter cards.
// Route-invariant tags (charset, viewport, theme-color, the noindex robots
// meta, og:site_name, og:locale, icons, Apple tags) stay static in
// `index.html`. Lines are joined so the splicer can indent the block.
//
// The social cards carry the website's absolute address, so they are the
// website's alone: the phone and desktop builds pass `social: false` and get
// the title and description only — nothing unfurls a page inside an app.
export function renderHead(
  route: RouteHead,
  { social = true }: { social?: boolean } = {},
): string {
  const title = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
  ];
  if (!social) return title.join("\n    ");
  const pageUrl = absoluteUrl(route.path);
  const ogTitle = route.ogTitle ?? route.title;
  const ogImage = absoluteUrl(DEFAULT_OG_IMAGE);
  const lines = [
    ...title,
    ``,
    `<meta property="og:type" content="${route.ogType}" />`,
    `<meta property="og:title" content="${esc(ogTitle)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${pageUrl}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${esc(OG_IMAGE_ALT)}" />`,
    ``,
    `<meta name="twitter:card" content="${TWITTER_CARD}" />`,
    `<meta name="twitter:title" content="${esc(ogTitle)}" />`,
    `<meta name="twitter:description" content="${esc(route.description)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    `<meta name="twitter:image:alt" content="${esc(OG_IMAGE_ALT)}" />`,
  ];
  return lines.join("\n    ");
}
