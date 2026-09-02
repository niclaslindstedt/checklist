// Swipe-to-reveal for side-menu rows — a pared-down sibling of
// `useRowSwipe`. Latches the foreground open past a small threshold to
// uncover an action strip: a left swipe reveals the trailing strip (a trash
// button), and — when the caller sizes one — a right swipe reveals a leading
// strip on the row's other edge. Unlike the checklist row's gesture nothing
// fires on its own — the revealed buttons are the only way to act, so a swipe
// never removes anything by itself.
//
// The caller spreads `handlers` onto the sliding foreground element and
// applies `translateX(offset)`, with `animating` gating the CSS
// transition. `trailingWidth` is how far the row latches open to the left and
// must match the width of the strip rendered behind the foreground's trailing
// edge; `leadingWidth` (default 0, meaning "no right swipe") does the same for
// the leading edge.

import { useCallback, useRef, useState, type PointerEvent } from "react";

// Movement before we commit to a horizontal vs. vertical gesture (so a
// vertical drag still scrolls the drawer instead of arming the swipe).
const AXIS_LOCK = 8;

/** Which strip a row is latched open on, or null when it rests closed. */
export type SwipeSide = "trailing" | "leading";

export interface SwipeReveal {
  offset: number;
  animating: boolean;
  /** True while latched open on either side. */
  open: boolean;
  /** The strip the row is latched open on (null while closed). */
  side: SwipeSide | null;
  close: () => void;
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => void;
  };
}

export function useSwipeReveal(
  trailingWidth: number,
  leadingWidth = 0,
): SwipeReveal {
  // Latch open once the swipe passes the halfway point of a strip.
  const openTrailingAt = trailingWidth / 2;
  const openLeadingAt = leadingWidth / 2;

  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [side, setSide] = useState<SwipeSide | null>(null);
  const open = side !== null;

  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"none" | "h" | "v">("none");
  const dx = useRef(0);
  const dragged = useRef(false);
  const wasOpen = useRef<SwipeSide | null>(null);
  const pointerId = useRef<number | null>(null);

  const close = useCallback(() => {
    setAnimating(true);
    setOffset(0);
    setSide(null);
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerId.current = e.pointerId;
      startX.current = e.clientX;
      startY.current = e.clientY;
      axis.current = "none";
      dx.current = 0;
      dragged.current = false;
      wasOpen.current = side;
      setAnimating(false);
    },
    [side],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (pointerId.current !== e.pointerId) return;
      const mx = e.clientX - startX.current;
      const my = e.clientY - startY.current;
      if (axis.current === "none") {
        if (Math.abs(mx) < AXIS_LOCK && Math.abs(my) < AXIS_LOCK) return;
        axis.current = Math.abs(mx) > Math.abs(my) ? "h" : "v";
        if (axis.current === "h")
          e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (axis.current !== "h") return;
      e.preventDefault();
      dragged.current = true;
      const base =
        wasOpen.current === "trailing"
          ? -trailingWidth
          : wasOpen.current === "leading"
            ? leadingWidth
            : 0;
      let next = base + mx;
      // Rubber-band past either open extent so the row feels bounded; a side
      // with no strip is a hard stop, so a swipe toward it simply doesn't
      // move the row.
      if (next > leadingWidth) {
        next =
          leadingWidth === 0 ? 0 : leadingWidth + (next - leadingWidth) * 0.3;
      }
      if (next < -trailingWidth) {
        next =
          trailingWidth === 0
            ? 0
            : -trailingWidth + (next + trailingWidth) * 0.3;
      }
      dx.current = next;
      setOffset(next);
    },
    [trailingWidth, leadingWidth],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (pointerId.current !== e.pointerId) return;
      pointerId.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      if (axis.current !== "h") {
        axis.current = "none";
        return;
      }
      axis.current = "none";
      const traveled = dx.current;
      setAnimating(true);
      if (trailingWidth > 0 && traveled <= -openTrailingAt) {
        setSide("trailing");
        setOffset(-trailingWidth);
        return;
      }
      if (leadingWidth > 0 && traveled >= openLeadingAt) {
        setSide("leading");
        setOffset(leadingWidth);
        return;
      }
      setSide(null);
      setOffset(0);
    },
    [openTrailingAt, openLeadingAt, trailingWidth, leadingWidth],
  );

  // Swallow the click that trails a drag (so a swipe never activates the
  // row), and turn a tap on an already-open row into a close.
  const onClickCapture = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (dragged.current) {
        e.preventDefault();
        e.stopPropagation();
        dragged.current = false;
        return;
      }
      if (wasOpen.current !== null && open) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    },
    [open, close],
  );

  return {
    offset,
    animating,
    open,
    side,
    close,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  };
}
