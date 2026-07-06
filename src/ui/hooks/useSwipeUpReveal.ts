import { useEffect, useRef, useState, type RefObject } from "react";

// Touch-driven "swipe up at the bottom of the list to reveal a drawer"
// gesture — the mirror image of `usePullToRefresh`. Where pull-to-refresh
// arms a downward drag that starts while the scroll region is at its top,
// this arms an *upward* drag that starts while the region is at its
// bottom, and fires `onReveal` once the finger crosses `TRIGGER_DISTANCE`
// and lets go. The checklist view uses it to raise the archived-items
// drawer from the foot of a list.
//
// Scoped to a single scroll container (the caller's `containerRef`) rather
// than the document, so it knows the list — not some other scroll region —
// is at its bottom, and so a short list that doesn't scroll (already at
// bottom) still arms.
//
// Touch-only by design, like pull-to-refresh: revealing a bottom drawer is
// a phone gesture, and the archive is reachable from the side menu on a
// desktop pointer.

// Damped drag distance (px) the finger must reach before release fires
// `onReveal`. Tuned to match pull-to-refresh's feel from the other end.
const TRIGGER_DISTANCE = 64;
// Max damped distance the hint travels; further pulling past this does
// nothing, signalling "armed — let go".
const MAX_PULL = 100;
// Resistance applied to raw finger travel so the pull feels springy rather
// than 1:1 (0.5 = the hint moves half as far as the finger).
const RESISTANCE = 0.5;
// Slack (px) allowed at the bottom edge before we consider the region
// "not at the bottom" — sub-pixel scroll heights leave a fractional gap.
const BOTTOM_EPSILON = 2;

export type SwipeUpRevealState = "idle" | "pulling" | "release";

type Options = {
  /** When false the listeners are mounted but no-op (no archive, drawer already open, …). */
  enabled: boolean;
  /** Called once when a completed upward swipe past the trigger is recognised. */
  onReveal: () => void;
};

type Result = {
  state: SwipeUpRevealState;
  /** Current damped pull distance in px (0..MAX_PULL) for an optional hint. */
  pullDistance: number;
};

function isFormInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

function hasOpenModal(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

// True only when `el` is scrolled to (or within a hair of) its bottom, so a
// further upward drag can't scroll the list any lower and should arm the
// reveal instead.
function atScrollBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_EPSILON;
}

export function useSwipeUpReveal(
  containerRef: RefObject<HTMLElement | null>,
  { enabled, onReveal }: Options,
): Result {
  const [state, setState] = useState<SwipeUpRevealState>("idle");
  const [pullDistance, setPullDistance] = useState(0);

  // Mirror the live inputs into refs so the container listeners attach once
  // and read the latest values without re-subscribing every render.
  const cfg = useRef({ enabled, onReveal });
  cfg.current = { enabled, onReveal };
  const stateRef = useRef<SwipeUpRevealState>("idle");
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setStateBoth = (next: SwipeUpRevealState) => {
      if (stateRef.current === next) return;
      stateRef.current = next;
      setState(next);
    };
    const setPullBoth = (next: number) => {
      if (pullRef.current === next) return;
      pullRef.current = next;
      setPullDistance(next);
    };
    const resetIdle = () => {
      startYRef.current = null;
      setPullBoth(0);
      setStateBoth("idle");
    };

    const onTouchStart = (e: TouchEvent) => {
      startYRef.current = null;
      if (!cfg.current.enabled) return;
      if (e.touches.length !== 1) return;
      if (hasOpenModal()) return;
      if (isFormInteractive(e.target)) return;
      if (!atScrollBottom(el)) return;
      const touch = e.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      // Upward drag = negative delta; measure how far the finger has risen.
      const delta = startYRef.current - touch.clientY;
      // Dragged back down past the start — hand the gesture back to normal
      // scrolling (also covers a downward wobble after a small pull-up).
      if (delta <= 0) {
        resetIdle();
        return;
      }
      // The list grew scrollable mid-drag (a body editor expanded, say) — the
      // finger should scroll it, not fight the reveal.
      if (!atScrollBottom(el)) {
        resetIdle();
        return;
      }
      const damped = Math.min(delta * RESISTANCE, MAX_PULL);
      setPullBoth(damped);
      setStateBoth(damped >= TRIGGER_DISTANCE ? "release" : "pulling");
      // Suppress the browser's native overscroll (iOS rubber-band, Android
      // URL-bar) once we own the gesture. Only while armed, so an ordinary
      // upward flick that never crosses into a pull stays smooth.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      const distance = pullRef.current;
      startYRef.current = null;
      if (distance >= TRIGGER_DISTANCE) cfg.current.onReveal();
      resetIdle();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    // Non-passive so we can `preventDefault()` the native overscroll once armed.
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [containerRef]);

  return { state, pullDistance };
}
