// Per-route SEO metadata and the renderers that turn it into the HTML
// `<head>` payload, the `<noscript>` fallback body, sitemap.xml, robots.txt,
// and llms.txt. Consumed by the build-time head injector and the route
// splicer in `vite.config.ts`: the homepage block in `index.html` (between
// the HEAD_SEO_START / HEAD_SEO_END markers) is filled from `HOME_ROUTE`,
// and `dist/privacy/index.html` is spliced from `PRIVACY_ROUTE`. Add a new
// route here and wire its alias in `vite.config.ts` to extend.
// Mirrors budget's `src/seo/routes.ts`, trimmed to checklist's routes.

import {
  AUTHOR,
  AUTHOR_SAME_AS,
  DEFAULT_OG_IMAGE,
  NONCANONICAL_PATHS,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LANGUAGE,
  SITE_NAME,
  SITE_URL,
  SITEMAP_PATH,
  TWITTER_CARD,
  absoluteUrl,
} from "./siteConfig";

export type OgType = "website" | "article";

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapEntry {
  changefreq: ChangeFreq;
  // 0.0 - 1.0; rendered to one decimal place in sitemap.xml.
  priority: number;
}

export interface RouteSeo {
  // URL path the route is served at, with trailing slash on sub-routes.
  // Used as the canonical URL suffix and the alias output directory.
  path: string;
  title: string;
  description: string;
  // Social-card title; falls back to `title` when omitted.
  ogTitle?: string;
  ogType: OgType;
  // Top-level JSON-LD blocks to embed in <head>. Use the canonical
  // `${SITE_URL}/#author` @id for the author Person so Google dedupes
  // the entity across pages.
  jsonLd: object[];
  // sitemap.xml row. Omit to keep the route out of the sitemap.
  sitemap?: SitemapEntry;
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
// (crawlers, link unfurlers, no-JS readers). createRoot() in main.tsx
// replaces #app the moment the bundle runs, so normal visitors never see
// it. The copy mirrors the meta description so a crawler can't read the
// body and the description and decide they disagree. Inline single quotes
// in the style so the fragment stays valid when spliced into the alias.
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

export function resolveNoscriptBody(route: RouteSeo): string {
  if (route.noscriptBody) return route.noscriptBody;
  return noscript(route.title, [
    esc(route.description),
    "This page needs JavaScript to render fully. Enable JavaScript and reload.",
  ]);
}

// --- JSON-LD graph ---------------------------------------------------------
const AUTHOR_PERSON = {
  "@type": "Person",
  "@id": `${SITE_URL}/#author`,
  name: AUTHOR.name,
  url: AUTHOR.url,
  sameAs: [...AUTHOR_SAME_AS],
} as const;

const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  inLanguage: SITE_LANGUAGE,
  publisher: { "@id": `${SITE_URL}/#author` },
} as const;

export const HOME_ROUTE: RouteSeo = {
  path: "/",
  title: `${SITE_NAME} — local-first checklist & template PWA`,
  ogTitle: `${SITE_NAME} — local-first checklist PWA`,
  description: SITE_DESCRIPTION,
  ogType: "website",
  sitemap: { changefreq: "weekly", priority: 1.0 },
  jsonLd: [
    { "@context": "https://schema.org", ...AUTHOR_PERSON },
    WEBSITE,
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern browser with JavaScript enabled.",
      inLanguage: SITE_LANGUAGE,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      author: { "@id": `${SITE_URL}/#author` },
      publisher: { "@id": `${SITE_URL}/#author` },
      screenshot: absoluteUrl(DEFAULT_OG_IMAGE),
      keywords: SITE_KEYWORDS,
      featureList: [
        "Works offline as an installable PWA",
        "Local-first storage with no account or backend",
        "Reusable checklist templates",
        "Namespaces for separate sets of checklists",
        "Markdown import and export",
        "Shareable lists via client-side URL fragments",
        "Optional end-to-end-encrypted Google Drive or Dropbox sync",
        "Undo/redo timeline",
        "Themes, fonts, and adjustable text size",
      ],
    },
  ],
};

export const PRIVACY_ROUTE: RouteSeo = {
  path: "/privacy/",
  title: `Privacy — ${SITE_NAME}`,
  description:
    "checklist privacy: local-first by default — no account, no cookies, no " +
    "analytics, no tracking. Optional Dropbox / Google Drive sync only when " +
    "you connect it.",
  ogType: "article",
  sitemap: { changefreq: "monthly", priority: 0.5 },
  noscriptBody: noscript("Privacy policy — checklist", [
    "checklist is a local-first checklist app served as a static site. It runs entirely in your browser: there is no backend of our own, no account, no cookies, and no analytics or tracking. By default your lists stay on your device and never leave it. You can optionally connect a cloud backend (Dropbox or Google Drive) to sync them across your own devices — only then are your lists sent to that one provider, at your explicit request. The project authors never receive them.",
    "The full privacy policy needs JavaScript to render. Enable JavaScript and reload, or read the source on GitHub.",
  ]),
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${absoluteUrl("/privacy/")}#page`,
      url: absoluteUrl("/privacy/"),
      name: `Privacy — ${SITE_NAME}`,
      description:
        "How checklist handles your data: local-first, no tracking; optional cloud sync only when you connect it.",
      inLanguage: SITE_LANGUAGE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#app` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Privacy",
          item: absoluteUrl("/privacy/"),
        },
      ],
    },
  ],
};

// The `/home` showcase: a no-login marketing page that identifies the app,
// describes what it does, and explains why it requests Google Drive / Dropbox
// access — the page linked as the "app homepage" on the OAuth consent screen.
// Served from `dist/home/index.html` by the `emit-showcase-alias` plugin in
// `vite.config.ts`; `main.tsx` mounts `ShowcasePage` for the `/home` path.
export const SHOWCASE_ROUTE: RouteSeo = {
  path: "/home/",
  title: "checklist — what it does & why it asks for access",
  description:
    "What checklist does, where your data lives, and why it requests Google " +
    "Drive or Dropbox access — only when you turn on optional cloud sync.",
  ogType: "website",
  sitemap: { changefreq: "monthly", priority: 0.8 },
  noscriptBody: noscript("checklist — a local-first checklist PWA", [
    "checklist is a fast, local-first checklist and template app that runs entirely in your browser, works offline, and needs no account. By default your lists are stored only on your device and never leave it. You can optionally turn on cloud sync, at which point — and only then — the app asks for access to an app-specific folder in your Google Drive or Dropbox, purely to save and load your own lists across your devices.",
    "This page needs JavaScript to render fully. Enable JavaScript and reload.",
  ]),
  jsonLd: [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${absoluteUrl("/home/")}#page`,
      url: absoluteUrl("/home/"),
      name: `About ${SITE_NAME}`,
      description:
        "What checklist does, where your data lives, and why it requests Google Drive or Dropbox access only when you enable optional cloud sync.",
      inLanguage: SITE_LANGUAGE,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#app` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${SITE_URL}/`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "About",
          item: absoluteUrl("/home/"),
        },
      ],
    },
  ],
};

export const ROUTES: readonly RouteSeo[] = [
  HOME_ROUTE,
  SHOWCASE_ROUTE,
  PRIVACY_ROUTE,
];

// --- <head> renderer -------------------------------------------------------
// Renders the route-specific <head> payload (everything between the
// HEAD_SEO markers): title, description, canonical, robots, OG + Twitter
// cards, and JSON-LD. Route-invariant tags (charset, viewport, theme-color,
// og:site_name, og:locale, the sitemap link, icons, Apple tags) stay static
// in `index.html`. Lines are joined so the splicer can indent the block.
export function renderHeadSeo(route: RouteSeo): string {
  const canonical = absoluteUrl(route.path);
  const ogTitle = route.ogTitle ?? route.title;
  const ogImage = absoluteUrl(DEFAULT_OG_IMAGE);
  const lines = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}" />`,
    `<meta name="keywords" content="${esc(SITE_KEYWORDS)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta name="robots" content="index,follow,max-image-preview:large" />`,
    ``,
    `<meta property="og:type" content="${route.ogType}" />`,
    `<meta property="og:title" content="${esc(ogTitle)}" />`,
    `<meta property="og:description" content="${esc(route.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
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
    ...route.jsonLd.map(
      (block) =>
        `<script type="application/ld+json">\n${JSON.stringify(block, null, 2)}\n</script>`,
    ),
  ];
  return lines.join("\n    ");
}

// --- discovery files -------------------------------------------------------
export function renderSitemap(routes: readonly RouteSeo[]): string {
  const entries = routes
    .filter(
      (r): r is RouteSeo & { sitemap: NonNullable<RouteSeo["sitemap"]> } =>
        Boolean(r.sitemap),
    )
    .map((r) => {
      const loc = absoluteUrl(r.path);
      const priority = r.sitemap.priority.toFixed(1);
      return [
        `  <url>`,
        `    <loc>${loc}</loc>`,
        `    <changefreq>${r.sitemap.changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        `  </url>`,
      ].join("\n");
    });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries,
    `</urlset>`,
    ``,
  ].join("\n");
}

export function renderRobotsTxt(): string {
  return [
    `User-agent: *`,
    `Allow: /`,
    ``,
    `# The deploy slots below share this origin but are not canonical`,
    `# (see "Deployment slots" in AGENTS.md) — keep them out of the index.`,
    ...NONCANONICAL_PATHS.map((p) => `Disallow: ${p}`),
    ``,
    `Sitemap: ${absoluteUrl(SITEMAP_PATH)}`,
    ``,
  ].join("\n");
}

export function renderLlmsTxt(routes: readonly RouteSeo[]): string {
  const lines = [
    `# ${SITE_NAME}`,
    ``,
    `> ${SITE_DESCRIPTION}`,
    ``,
    `## Pages`,
    ``,
  ];
  for (const r of routes) {
    lines.push(`- [${r.title}](${absoluteUrl(r.path)}): ${r.description}`);
  }
  lines.push(``, `## Source`, ``);
  lines.push(
    `- [Source on GitHub](${AUTHOR.github}/checklist): MIT-licensed TypeScript PWA built with React, Vite, and Tailwind.`,
    ``,
  );
  return lines.join("\n");
}
