// Publish the pinned sidebar's footprint to the document as CSS variables
// so a viewport-`fixed` overlay mounted *outside* App's flex layout can
// centre itself over the content area rather than the whole window. The
// `UpdateToast` is the case in point: `LanguageRoot` renders it on every
// route, so it can't read the nav context, yet on a wide screen the pinned
// side menu eats 16rem on one edge and a window-centred toast lands visibly
// off-centre over the content.
//
// The variables are cleared on unmount, so the standalone privacy / home
// pages — which never mount `App` and so have no sidebar — fall back to a
// zero inset and centre on the full window as before.

import { useEffect } from "react";

// Matches `w-64` on the pinned `<nav>` in `SideMenu`.
const SIDEBAR_WIDTH = "16rem";

export function useSidebarInset(
  pinned: boolean,
  side: "left" | "right",
): void {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--app-content-left",
      pinned && side === "left" ? SIDEBAR_WIDTH : "0px",
    );
    root.style.setProperty(
      "--app-content-right",
      pinned && side === "right" ? SIDEBAR_WIDTH : "0px",
    );
    return () => {
      root.style.removeProperty("--app-content-left");
      root.style.removeProperty("--app-content-right");
    };
  }, [pinned, side]);
}
