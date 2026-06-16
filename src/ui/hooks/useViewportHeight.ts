// Keep the pinned shell aligned to the *visual* viewport rather than the
// layout viewport. The shell is `height: 100svh; overflow: hidden` (see
// theme.css), and `svh` is a fixed value that ignores the on-screen
// keyboard. So on mobile, focusing the bottom-pinned add-item composer
// makes iOS scroll the whole shell to reveal the field above the keyboard.
//
// `window.visualViewport` reports the region actually visible above the
// keyboard — both its size (`width`/`height`) and where it sits within the
// layout viewport (`offsetTop`/`offsetLeft`, which iOS shifts when the
// keyboard opens). Just shrinking the height isn't enough: iOS scrolls the
// visual viewport down by `offsetTop`, which `window.scrollTo` can't reset,
// leaving the shrunk shell pushed up off the top of the screen.
//
// So we mirror the full visual-viewport rect into CSS variables and let
// theme.css pin `#app` as a fixed overlay exactly over that rect. The
// composer lands just above the keyboard with the list still in view, and
// because the focused input already sits inside an element positioned
// within the visual viewport, the browser has nothing left to scroll.
//
// The same rect (`--app-top`/`--app-left`/`--app-width`/`--app-height`)
// also pins the full-screen overlays — the settings/modal backdrop and the
// side-menu drawer. They are `position: fixed`, which iOS lays out against
// the *layout* viewport; when that drifts from the visual viewport (e.g.
// the keyboard, or a pinch that leaves the page subtly offset) a bare
// `inset: 0` leaves them shifted off the visible box while `#app` stays put.
// Anchoring them to the same rect keeps every layer aligned to what's on
// screen.

import { useEffect } from "react";

export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-width", `${vv.width}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
      root.style.setProperty("--app-left", `${vv.offsetLeft}px`);
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-width");
      root.style.removeProperty("--app-top");
      root.style.removeProperty("--app-left");
    };
  }, []);
}
