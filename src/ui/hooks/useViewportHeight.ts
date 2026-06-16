// Keep the pinned shell aligned to the *visual* viewport on the vertical
// axis. The shell is `height: 100svh; overflow: hidden` (see theme.css),
// and `svh` is a fixed value that ignores the on-screen keyboard. So on
// mobile, focusing the bottom-pinned add-item composer makes iOS scroll the
// whole shell to reveal the field above the keyboard.
//
// `window.visualViewport` reports the region actually visible above the
// keyboard — both its `height` and where it sits within the layout viewport
// (`offsetTop`, which iOS shifts when the keyboard opens). Just shrinking
// the height isn't enough: iOS scrolls the visual viewport down by
// `offsetTop`, which `window.scrollTo` can't reset, leaving the shrunk
// shell pushed up off the top of the screen.
//
// So we mirror the *vertical* visual-viewport metrics (`--app-top` /
// `--app-height`) into CSS variables and let theme.css pin `#app` as a
// fixed overlay over that vertical band, full-width on the layout viewport.
// The composer lands just above the keyboard with the list still in view,
// and because the focused input already sits inside an element positioned
// within the visual viewport, the browser has nothing left to scroll.
//
// We deliberately do NOT mirror the horizontal axis (`width` / `offsetLeft`).
// The keyboard never changes those, and tracking them is actively harmful:
// `visualViewport.width` is fractional, so a sub-pixel-wide `#app` (a fixed
// element `body`'s `overflow:hidden` doesn't clip) makes the page pannable
// sideways, and every horizontal pan then fires this `scroll` handler, which
// rewrites the width/left mid-gesture and repositions the shell — a feedback
// loop that surfaces as a horizontal scrollbar and flickering text on iOS.
// The shell and overlays stay pinned to the layout viewport horizontally
// (`left: 0; width: 100%`), which `overflow: hidden` keeps scroll-free.
//
// The same vertical band (`--app-top` / `--app-height`) also pins the
// full-screen overlays — the settings/modal backdrop and the side-menu
// drawer — so every `position: fixed` layer follows the keyboard together.

import { useEffect } from "react";

export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    };
  }, []);
}
