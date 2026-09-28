// Single source of truth for the site's copy strings and URLs: <title>,
// meta descriptions, and the Open Graph / Twitter tags. Both runtime code
// (e.g. the side-menu "source" link) and the build-time head injector /
// route splicer in `vite.config.ts` import from here, so tweaking the
// site's pitch is a one-file change. There is no SEO, by owner decision:
// every page carries `noindex` (see `index.html`).

export const SITE_URL = "https://checklist.niclaslindstedt.se";

export const SITE_NAME = "checklist";

export const SITE_DESCRIPTION =
  "A fast, local-first checklist PWA that works offline with no account. " +
  "Reusable templates, shareable links, and optional encrypted Google " +
  "Drive or Dropbox sync.";

export const SITE_LANGUAGE = "en";

// The name a build calls itself inside the app. Only the phone build ships
// under a store listing, so only it takes the listing name (`APP_DISPLAY_NAME`,
// never committed); every other build, and a phone build with nothing set,
// keeps the project's own. `vite.config.ts` folds the answer into
// `APP_NAME` (`src/build-env.ts`).
export function resolveAppName(
  isNative: boolean,
  displayName: string | undefined,
): string {
  return (isNative && displayName?.trim()) || SITE_NAME;
}

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

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = SITE_URL.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}
