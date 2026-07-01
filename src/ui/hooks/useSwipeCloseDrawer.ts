import { useEffect, useRef } from "react";

import type { MenuButtonSide } from "../../settings/types.ts";

// Touch-driven "swipe the open drawer back toward its resting edge to close
// it" gesture — the mirror image of `useEdgeSwipeOpen`. Where that one pulls
// the panel in from the edge, this one pushes it back out: a swipe toward the
// drawer's resting side (leftward when docked left, rightward when docked
// right) dismisses it, the natural counterpart to the inward open swipe and
// the tap-the-backdrop close.
//
// A press that then travels outward past `CLOSE_DISTANCE` — while staying more
// horizontal than vertical, so it doesn't fight a scroll of the drawer's own
// list — calls `onClose`. A gesture that starts on a row's own
// swipe-to-reveal surface (tagged `data-swipe-row`) is left alone: that
// gesture latches the row's trash open and shares the same direction, so the
// row owns it and the drawer stays put.
//
// Touch-only by design (like `useEdgeSwipeOpen` and pull-to-refresh): swiping
// a drawer shut is a phone gesture, and a docked/pinned sidebar has no
// open/close to dismiss.

// Outward travel (px) the finger must cover before the drawer closes.
const CLOSE_DISTANCE = 48;

type Options = {
  /** The drawer's resting side — the direction an outward swipe travels. */
  side: MenuButtonSide;
  /** When false the listener is mounted but no-ops (drawer closed/pinned). */
  enabled: boolean;
  /** Called once when a completed outward swipe is recognised. */
  onClose: () => void;
};

function hasOpenModal(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

export function useSwipeCloseDrawer({ side, enabled, onClose }: Options): void {
  // Mirror the live inputs into a ref so the document listeners can attach
  // once and read the latest values without re-subscribing every render (the
  // drawer's side / open flag changes independently).
  const cfg = useRef({ side, enabled, onClose });
  cfg.current = { side, enabled, onClose };

  useEffect(() => {
    const start = { x: 0, y: 0, armed: false, fired: false };

    const onTouchStart = (e: TouchEvent) => {
      start.armed = false;
      start.fired = false;
      if (!cfg.current.enabled) return;
      if (e.touches.length !== 1) return;
      if (hasOpenModal()) return;
      const touch = e.touches[0];
      if (!touch) return;
      // A swipe that begins on a row's swipe-to-reveal surface belongs to that
      // gesture (it latches the trash open in the same direction) — leave it be.
      const target = e.target;
      if (target instanceof Element && target.closest("[data-swipe-row]"))
        return;
      start.x = touch.clientX;
      start.y = touch.clientY;
      start.armed = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!start.armed || start.fired) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // A mostly-vertical drag is a scroll of the drawer's list — bail.
      if (Math.abs(dy) > Math.abs(dx)) {
        start.armed = false;
        return;
      }
      // Outward = toward the resting edge: leftward when docked left,
      // rightward when docked right.
      const outward = cfg.current.side === "left" ? -dx : dx;
      if (outward < CLOSE_DISTANCE) return;
      start.fired = true;
      start.armed = false;
      if (e.cancelable) e.preventDefault();
      cfg.current.onClose();
    };

    const onTouchEnd = () => {
      start.armed = false;
      start.fired = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    // Non-passive so the outward swipe can be claimed from any native gesture.
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
