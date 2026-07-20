// Handles the `checklist://` deep links a widget, a Lock Screen / Control
// Center control, or a notification can fire at the app:
//
//   checklist://open?list=<id>   — bring a specific list to the front
//   checklist://add?list=<id>    — open that list and focus the composer
//
// The native wrapper maps the incoming URL onto a call to the global this hook
// installs (`window.__checklistDeepLink(action, listId)`), injected into the
// WebView when the link arrives — so a link fired while the app is already
// running switches lists in place rather than reloading. As a fallback for a
// cold start that navigates the WebView to a URL instead, the query string is
// read once on mount. A no-op in a plain browser, where neither path fires.

import { useEffect } from "react";

import { FOCUS_COMPOSER_EVENT } from "../ui/composer-events.ts";

/** The deep-link actions the wrapper can dispatch. */
export type WidgetDeepLinkAction = "open" | "add";

declare global {
  // Installed by this hook, called by the native wrapper via `injectJavaScript`.
  var __checklistDeepLink: WidgetDeepLinkHandler | undefined;
}

type WidgetDeepLinkHandler = (action: string, listId?: string) => void;

export function useWidgetDeepLink(deps: {
  /** Switch the active list to `id`. */
  selectChecklist: (id: string) => void;
}): void {
  const { selectChecklist } = deps;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handle = (action: string, listId?: string) => {
      if (listId) selectChecklist(listId);
      if (action === "add") {
        // The composer lives deep in the tree; a window event lets it focus
        // itself without this hook holding a ref across the app.
        window.dispatchEvent(new CustomEvent(FOCUS_COMPOSER_EVENT));
      }
    };

    window.__checklistDeepLink = handle;

    // Cold-start fallback: the wrapper may have navigated to `?add=<id>` /
    // `?open=<id>` instead of injecting a call. Apply it once, then strip the
    // params so a later reload doesn't re-fire the link.
    const params = new URLSearchParams(window.location.search);
    const addList = params.get("add");
    const openList = params.get("open");
    if (addList) {
      handle("add", addList);
    } else if (openList) {
      handle("open", openList);
    }
    if (addList || openList) {
      params.delete("add");
      params.delete("open");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname +
          (query ? `?${query}` : "") +
          window.location.hash,
      );
    }

    return () => {
      if (window.__checklistDeepLink === handle) {
        delete window.__checklistDeepLink;
      }
    };
  }, [selectChecklist]);
}
