import { PrivacyPage } from "../ui/PrivacyPage.tsx";
import { ShowcasePage } from "../ui/ShowcasePage.tsx";
import type { StaticRoute } from "./static-routes.ts";

// The one component that renders a standalone page, used by both the client
// entry and the build-time prerenderer. Hydration only works if the markup
// baked into the HTML is exactly what the client would have produced, so both
// sides mount *this*, never the page components directly.
//
// Note what is deliberately absent: `LanguageRoot`. These pages are
// English-only and use no `useT`, no toasts, and no app state, so the wrapper
// would contribute nothing to render — while its `readLanguagePreference()`
// (localStorage) and `UpdateToast` (service-worker registration) are exactly
// the browser-only work that cannot run in Node. Leaving it off is what makes
// this tree renderable at build time, and it also means a crawler fetching
// `/home` no longer installs a service worker to read a static page.

export function StaticRouteView({ route }: { route: StaticRoute }) {
  return route === "home" ? <ShowcasePage /> : <PrivacyPage />;
}
