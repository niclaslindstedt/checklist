// Single source of truth for every SEO copy string and URL: <title>,
// meta descriptions, Open Graph / Twitter tags, JSON-LD, robots.txt,
// the sitemap, and llms.txt. Both runtime code (e.g. the side-menu
// "source" link) and the build-time head injector / route splicer in
// `vite.config.ts` import from here, so tweaking the site's pitch is a
// one-file change. Mirrors budget's `src/seo/siteConfig.ts`.

export const SITE_URL = "https://checklist.niclaslindstedt.se";

export const SITE_NAME = "checklist";
export const SITE_TAGLINE = "A local-first checklist PWA";

export const SITE_DESCRIPTION =
  "A fast, local-first checklist PWA that works offline with no account. " +
  "Reusable templates, shareable links, and optional encrypted Google " +
  "Drive or Dropbox sync.";

export const SITE_LANGUAGE = "en";
export const SITE_LOCALE = "en";

export const SITE_KEYWORDS =
  "checklist, todo, to-do list, task list, PWA, offline, local-first, " +
  "templates, markdown, shareable list, Google Drive sync, Dropbox sync, " +
  "encrypted, no account, free";

export const AUTHOR = {
  name: "Niclas Lindstedt",
  url: "https://niclaslindstedt.se",
  github: "https://github.com/niclaslindstedt",
  linkedin: "https://www.linkedin.com/in/niclaslindstedt/",
} as const;

export const AUTHOR_SAME_AS: readonly string[] = [
  AUTHOR.github,
  AUTHOR.linkedin,
];

export const REPO_URL = "https://github.com/niclaslindstedt/checklist";

// The app's icon doubles as its social card. It is a square 512×512 PNG,
// so the Twitter card is `summary` (not `summary_large_image`, which wants
// a 1200×630 landscape image). Swap to a dedicated 1200×630 og-default.png
// and bump these dimensions + the card type if a richer card is ever made.
export const DEFAULT_OG_IMAGE = "/pwa-512x512.png";
export const OG_IMAGE_WIDTH = 512;
export const OG_IMAGE_HEIGHT = 512;
export const OG_IMAGE_ALT = `${SITE_NAME} app icon`;
export const TWITTER_CARD = "summary";

export const SITEMAP_PATH = "/sitemap.xml";
export const ROBOTS_PATH = "/robots.txt";
export const LLMS_PATH = "/llms.txt";

// Deploy slots that share this origin but are not canonical (see
// "Deployment slots" in AGENTS.md). robots.txt keeps them out of the index.
export const NONCANONICAL_PATHS: readonly string[] = ["/preview/", "/branch/"];

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = SITE_URL.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}
