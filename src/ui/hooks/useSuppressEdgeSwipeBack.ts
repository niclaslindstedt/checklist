import { useEffect, useRef } from "react";

// Cancels the operating system's edge swipe-back / -forward navigation
// inside the installed PWA. iOS keeps its left-edge "swipe to go back"
// gesture alive even in a standalone home-screen app (and Android's gesture
// nav does the same from either border), so a swipe that starts at the
// screen edge to open the side drawer instead pops the PWA's history and
// tears the app out from under the user. Cancelling the browser default on
// a horizontal touch that begins in the edge zone stops that navigation;
// the drawer's own `useEdgeSwipeOpen` still sees the move and opens as
// intended (preventDefault suppresses navigation, not our own listeners).
//
// Touch-only, and only wanted in the standalone PWA — a normal browser tab
// has chrome and a real history, so it keeps its native back-swipe. The
// caller gates this on `isStandaloneMobile`.

// How close to a side border (px) a touch must start for its horizontal
// travel to count as an edge-navigation gesture worth cancelling. Matches
// `useEdgeSwipeOpen`'s zone so the two read the same edge.
const EDGE_ZONE = 30;

export function useSuppressEdgeSwipeBack(enabled: boolean): void {
  // Mirror the live flag into a ref so the document listeners attach once and
  // read the latest value without re-subscribing on every render.
  const on = useRef(enabled);
  on.current = enabled;

  useEffect(() => {
    const start = { x: 0, y: 0, fromEdge: false };

    const onTouchStart = (e: TouchEvent) => {
      start.fromEdge = false;
      if (!on.current) return;
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      const fromLeft = touch.clientX <= EDGE_ZONE;
      const fromRight = touch.clientX >= window.innerWidth - EDGE_ZONE;
      if (!fromLeft && !fromRight) return;
      start.x = touch.clientX;
      start.y = touch.clientY;
      start.fromEdge = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!start.fromEdge) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // A mostly-vertical drag is a scroll that merely began near the edge —
      // leave it alone so the list still scrolls.
      if (Math.abs(dy) > Math.abs(dx)) {
        start.fromEdge = false;
        return;
      }
      // Horizontal travel from the border is the OS back/forward swipe.
      // Cancel its default so the PWA doesn't navigate out of itself.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      start.fromEdge = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    // Non-passive so the horizontal edge swipe can be claimed from the native
    // navigation gesture.
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);
}
