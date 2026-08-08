// Which standalone page a pathname resolves to, shared by the client entry
// (`main.tsx`) and the build-time prerenderer (`prerender.tsx`) so the two
// can never disagree about what a URL renders — the invariant hydration
// depends on.
//
// These two routes are deliberately *not* the app. They are self-contained,
// English-only documents with no app state, which is exactly what makes them
// safe to render to HTML at build time (see `StaticRouteView`).

/** A route the build renders to real HTML instead of an empty shell. */
export type StaticRoute = "home" | "privacy";

export const STATIC_ROUTES: readonly StaticRoute[] = ["home", "privacy"];

/**
 * Resolve a `location.pathname` to its standalone page, or `null` for the
 * app itself.
 *
 * The deploy slots nest each page one segment deeper (`/preview/home/`,
 * `/branch/privacy/`), so the match is on the trailing segment rather than
 * the whole path.
 */
export function staticRouteFor(pathname: string): StaticRoute | null {
  const path = pathname.replace(/\/$/, "");
  if (path.endsWith("/home")) return "home";
  if (path.endsWith("/privacy")) return "privacy";
  return null;
}
