// Keep the pinned shell sized to the *visual* viewport rather than the
// layout viewport. The shell is `height: 100svh; overflow: hidden` (see
// theme.css), and `svh` is a fixed value that ignores the on-screen
// keyboard. So on mobile, focusing the bottom-pinned add-item composer
// makes iOS scroll the whole fixed shell up to reveal the field above the
// keyboard — dragging the header and item list off the top of the screen.
//
// `window.visualViewport` reports the region actually visible above the
// keyboard. Mirroring its height into `--app-height` (consumed by
// html/body/#app) shrinks the shell to fit that region, so the composer
// lands just above the keyboard with the list still in view and the
// browser has no reason to scroll. We also pin the window back to the top
// each tick to undo any scroll iOS applied before the resize settled.

import { useEffect } from "react";

export function useViewportHeight(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
      // Counter any scroll iOS applied to bring the focused input into
      // view; the shrunk shell already keeps it visible above the keyboard.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.removeProperty("--app-height");
    };
  }, []);
}
