// Swipe-to-reveal gesture for checklist rows, the React counterpart of
// the budget project's `useRowSwipe`. Same model — arm on a dominant
// horizontal axis past a small threshold — but it drives a live
// transform and two outcomes instead of a single reveal toggle:
//
//   • swipe LEFT  → latch the foreground open to uncover a Delete button
//                   (a deliberate two-step so a delete is never one flick).
//   • swipe RIGHT → archive once past the threshold; the foreground slides
//                   off and the caller drops the row on the next render.
//
// The caller spreads `handlers` onto the sliding foreground element and
// applies `translateX(offset)` with `animating` gating the CSS transition.

import { useCallback, useRef, useState, type PointerEvent } from "react";

// Mirrors the action-strip width the row renders behind the foreground.
const ACTION_W = 96;
// Left-swipe distance that latches the delete drawer open.
const OPEN_AT = 48;
// Right-swipe distance that triggers archive.
const ARCHIVE_AT = 96;
// Movement before we commit to a horizontal vs. vertical gesture.
const AXIS_LOCK = 8;
// How long the slide-off animation runs before the row is archived.
const ARCHIVE_MS = 180;

export interface RowSwipe {
  offset: number;
  animating: boolean;
  open: boolean;
  close: () => void;
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    onClickCapture: (e: React.MouseEvent) => void;
  };
}

export function useRowSwipe(onArchive: () => void): RowSwipe {
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [open, setOpen] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"none" | "h" | "v">("none");
  const dx = useRef(0);
  const dragged = useRef(false);
  const wasOpen = useRef(false);
  const pointerId = useRef<number | null>(null);

  const close = useCallback(() => {
    setAnimating(true);
    setOffset(0);
    setOpen(false);
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
      wasOpen.current = open;
      setAnimating(false);
    },
    [open],
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (pointerId.current !== e.pointerId) return;
    const mx = e.clientX - startX.current;
    const my = e.clientY - startY.current;
    if (axis.current === "none") {
      if (Math.abs(mx) < AXIS_LOCK && Math.abs(my) < AXIS_LOCK) return;
      axis.current = Math.abs(mx) > Math.abs(my) ? "h" : "v";
      if (axis.current === "h") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (axis.current !== "h") return;
    e.preventDefault();
    dragged.current = true;
    let next = (wasOpen.current ? -ACTION_W : 0) + mx;
    // Rubber-band past the natural left extent so it feels bounded.
    if (next < -ACTION_W) next = -ACTION_W + (next + ACTION_W) * 0.3;
    dx.current = next;
    setOffset(next);
  }, []);

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
      if (traveled >= ARCHIVE_AT) {
        setOpen(false);
        setOffset(e.currentTarget.offsetWidth);
        window.setTimeout(onArchive, ARCHIVE_MS);
        return;
      }
      if (traveled <= -OPEN_AT) {
        setOpen(true);
        setOffset(-ACTION_W);
        return;
      }
      setOpen(false);
      setOffset(0);
    },
    [onArchive],
  );

  // Swallow the click that trails a drag (so a swipe never toggles the
  // checkbox), and turn a tap on an already-open row into a close.
  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      if (dragged.current) {
        e.preventDefault();
        e.stopPropagation();
        dragged.current = false;
        return;
      }
      if (wasOpen.current && open) {
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
