// FLIP animation for the checklist list. When checked items sink to the
// bottom (Settings → Lists, `sortCheckedToBottom`), the displayed order is a
// permutation of the document order, so checking an item moves its row down
// the list in a single frame. This hook slides each moved row from where it
// *was* to where it now *is* instead, so the re-sort reads as motion rather
// than a jump.
//
// The technique is FLIP (First, Last, Invert, Play): a `useLayoutEffect` runs
// after React has reordered the DOM but *before* the browser paints, so it can
// read every row's new position, diff it against the snapshot from the previous
// commit, and play each moved row from its old offset (`translateY(delta)`) to
// rest (`translateY(0)`). The animation runs through the Web Animations API, so
// it never touches React-managed inline styles and reverts itself cleanly.
//
// It stays out of the way of the pointer drag-to-reorder gesture, which owns
// the row transforms while a drag is live (see `useListReorder`): the hook is
// suspended for the duration of the drag and skips the first commit after it
// ends, so a drop settles instantly rather than fighting the lifted row's
// residual geometry.

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

const DURATION_MS = 260;
const EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/** A row that moved between two snapshots, with the distance (old top − new
 *  top) it must translate *from* so it appears to start where it was. */
export interface ReorderFlip {
  id: string;
  delta: number;
}

/**
 * The rows present in both snapshots whose offset changed, paired with their
 * pixel delta. Rows missing from `prev` are newly mounted — there's nowhere to
 * slide them from, so they're skipped. Pure, so the diff is unit-testable
 * without a DOM.
 */
export function reorderFlips(
  prev: ReadonlyMap<string, number>,
  next: ReadonlyMap<string, number>,
): ReorderFlip[] {
  const out: ReorderFlip[] = [];
  for (const [id, top] of next) {
    const before = prev.get(id);
    if (before === undefined) continue;
    const delta = before - top;
    if (delta !== 0) out.push({ id, delta });
  }
  return out;
}

// True when motion should be suppressed: the in-app reduce-motion toggle (the
// Custom theme writes `data-reduce-motion` on <html>) or the OS preference.
// Checked at play time because WAAPI animations — unlike CSS transitions — are
// not zeroed by the reduce-motion stylesheet guard.
function motionReduced(): boolean {
  if (
    typeof document !== "undefined" &&
    document.documentElement.dataset.reduceMotion === "true"
  ) {
    return true;
  }
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Slide the rows under `containerRef` from their previous positions to their
 * current ones whenever they reorder. `enabled` gates the whole effect (off
 * when the user has disabled the animation, or when checked-sorting — the only
 * thing that reorders rows on a tap — is off). `suspended` is true while a
 * pointer drag owns the row transforms; the hook then leaves the rows alone.
 */
export function useReorderFlip(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  suspended: boolean,
): void {
  const prev = useRef<Map<string, number>>(new Map());
  // Whether the previous commit was mid-drag: a drop ends the drag and commits
  // the move in the same render, and the captured geometry is the lifted (out
  // of flow) layout — animating from it would jump. Skip that one frame.
  const wasSuspended = useRef(false);

  const measure = useCallback((): Map<string, number> => {
    const el = containerRef.current;
    const out = new Map<string, number>();
    if (!el) return out;
    for (const node of el.querySelectorAll<HTMLElement>("[data-reorder-id]")) {
      const id = node.dataset.reorderId;
      if (id) out.set(id, node.offsetTop);
    }
    return out;
  }, [containerRef]);

  useLayoutEffect(() => {
    // While dragging, the drag owns the layout — don't measure (avoids a
    // forced reflow on every pointer move) or animate.
    if (suspended) {
      wasSuspended.current = true;
      return;
    }
    const next = measure();
    const play = enabled && !wasSuspended.current && !motionReduced();
    if (play) {
      const el = containerRef.current;
      for (const { id, delta } of reorderFlips(prev.current, next)) {
        const node = el?.querySelector<HTMLElement>(
          `[data-reorder-id="${CSS.escape(id)}"]`,
        );
        // jsdom (the test environment) has no Web Animations API; the guard
        // keeps the hook inert there rather than throwing.
        if (node && typeof node.animate === "function") {
          node.animate(
            [
              { transform: `translateY(${delta}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: DURATION_MS, easing: EASING },
          );
        }
      }
    }
    prev.current = next;
    wasSuspended.current = false;
  });

  // Keep the snapshot fresh after layout shifts that don't re-render the view —
  // a row's note body expanding or collapsing is local to that row, so without
  // this the next reorder would slide every row below it by the stale gap.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!suspended) prev.current = measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, measure, suspended]);
}
