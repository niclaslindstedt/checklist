// Pointer-driven drag for the checklist. A grip handle on each row arms the
// gesture (kept off the row body so it never collides with the horizontal
// swipe-to-archive/delete). While dragging, the picked-up row is lifted out of
// the list flow as a smaller, translucent copy that follows the finger — small
// enough to see the rows behind it — while a full-size *ghost* preview snaps
// into the spot where it would land. The row the finger is over is split into
// three zones: the top edge drops it *before* that row, the bottom edge
// *after* it, and the middle *into* it as a sub-item (the ghost indents a
// level). So reordering and nesting are the same gesture; on release the
// caller commits through `onReorder(draggedId, targetId, mode)`.
//
// Row positions are snapshotted once per drag and the drop target is computed
// from that static geometry plus the finger position, so the math stays stable
// until the single commit on drop. The snapshot is taken *after* the picked-up
// row lifts out of flow (and its subtree hides) — with the dragged row excluded
// — so it mirrors the collapsed layout actually on screen; measuring against
// the pre-lift positions would leave the row's vacated slot a dead zone it
// could never be dropped back into. The lifted row is positioned absolutely
// against the list, so the view marks its `<ul>` `position: relative`; its
// `top` is the row's offset captured at pointer-down.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type { DropMode } from "../../domain/checklists.ts";

// Vertical movement before the drag commits to actually moving rows, so a
// stationary press on the handle never nudges the list.
const AXIS_LOCK = 6;

// Fraction of a row's height at its top / bottom edge that drops the dragged
// item *beside* it (before / after); the middle band drops it *into* the row
// as a sub-item. The middle band is the wider half so that dragging squarely
// *onto* a row reliably nests it — easy to hit with a thumb on a phone.
const EDGE_ZONE = 0.25;

// How much the lifted row shrinks while dragging. A touch under full size so
// the rows it passes over (and the ghost preview) stay visible behind it.
const DRAG_SCALE = 0.92;

// Shared, stable "no transform" style handed to every row while no drag is
// in progress. Returning one frozen reference (rather than a fresh `{}` per
// row per render) lets the memoized rows skip re-rendering on an unrelated
// edit — only the row whose item changed reconciles.
const IDLE_ROW_STYLE: CSSProperties = Object.freeze({});

/** A measured row's vertical extent in viewport coordinates. */
export interface Rect {
  id: string;
  top: number;
  height: number;
}

export type { DropMode };

/** Where the dragged item would land if released now. */
export interface DropTarget {
  id: string;
  mode: DropMode;
}

// Only `pointerdown` lives on the grip: it arms the gesture, then the
// move/up/cancel handlers are bound to `window` for the rest of the drag (see
// `useListReorder`). Binding them to the element instead would lose the drop
// the moment a mouse release lands off the grip — a desktop mouse has no
// implicit pointer capture to fall back on, so the lifted row would freeze.
export interface DragHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
}

export interface ListReorder {
  containerRef: RefObject<HTMLUListElement | null>;
  draggingId: string | null;
  /** The current drop target + mode, for the row to draw its indicator. */
  dropTarget: DropTarget | null;
  rowStyle: (id: string) => CSSProperties;
  dragHandleProps: (id: string) => DragHandleProps;
  /**
   * Abandon any in-progress drag without committing a move and release the
   * pointer capture. For tearing the gesture down when something else seizes
   * the screen mid-drag (e.g. a sync-conflict modal) — otherwise the lifted
   * row and its captured pointer sit frozen on top of it.
   */
  cancel: () => void;
}

export function useListReorder(
  onReorder: (id: string, targetId: string, mode: DropMode) => void,
  /**
   * Whether `draggedId` may be dropped onto `targetId` — false when the
   * target is the dragged item itself or one of its own descendants (which
   * would orphan the subtree). Such rows are never offered as a target.
   */
  canDrop: (draggedId: string, targetId: string) => boolean = () => true,
): ListReorder {
  const containerRef = useRef<HTMLUListElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [delta, setDelta] = useState(0);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const rects = useRef<Rect[]>([]);
  // The id of the row currently picked up (null when idle). Kept as its own
  // ref rather than an index into `rects` because, once the drag arms, `rects`
  // is re-snapshotted *without* the dragged row (see the layout effect below),
  // so an index into it would no longer point at the right entry.
  const draggedIdRef = useRef<string | null>(null);
  // The element holding the pointer capture for the active drag, so `cancel`
  // can release it even though it never sees the originating event.
  const captureEl = useRef<HTMLElement | null>(null);
  // Offset of the lifted row's top within the (relatively positioned) list,
  // captured at pointer-down so the floating copy can be placed absolutely.
  const dragTop = useRef(0);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const armed = useRef(false);
  // Mirror the live drop target into a ref so `handleUp` reads the latest
  // without re-binding the window handler on every pointermove.
  const dropTargetRef = useRef<DropTarget | null>(null);
  const canDropRef = useRef(canDrop);
  canDropRef.current = canDrop;
  // Remover for the window listeners bound for the lifetime of the active drag
  // (see `bindWindow`). Held on a ref so `reset` can detach them without taking
  // a dependency on the handlers, keeping every callback's identity stable.
  const detachWindow = useRef<(() => void) | null>(null);

  // Snapshot every row's top/height in DOM order, keyed by its data attribute.
  const measure = useCallback((): Rect[] => {
    const el = containerRef.current;
    if (!el) return [];
    const out: Rect[] = [];
    for (const child of Array.from(el.children)) {
      const id = (child as HTMLElement).dataset.reorderId;
      if (!id) continue;
      const r = child.getBoundingClientRect();
      out.push({ id, top: r.top, height: r.height });
    }
    return out;
  }, []);

  // A second, dragged-row-excluded snapshot of the list taken once the row has
  // lifted out of flow and its subtree has hidden — so the drop math runs
  // against the collapsed layout that's actually on screen, not the pre-lift
  // geometry. Hidden subtree rows collapse to zero height; skip them too.
  const measureCollapsed = useCallback((): Rect[] => {
    const el = containerRef.current;
    if (!el) return [];
    const out: Rect[] = [];
    for (const child of Array.from(el.children)) {
      const id = (child as HTMLElement).dataset.reorderId;
      if (!id || id === draggedIdRef.current) continue;
      const r = child.getBoundingClientRect();
      if (r.height === 0) continue;
      out.push({ id, top: r.top, height: r.height });
    }
    return out;
  }, []);

  const reset = useCallback(() => {
    detachWindow.current?.();
    detachWindow.current = null;
    setDraggingId(null);
    setDelta(0);
    setDropTarget(null);
    dropTargetRef.current = null;
    draggedIdRef.current = null;
    captureEl.current = null;
    pointerId.current = null;
    armed.current = false;
  }, []);

  // Re-snapshot the collapsed layout the first time each drag arms the lifted
  // row. `draggingId` flips non-null inside `onPointerDown`, and this runs
  // after that render commits — while `dropTarget` is still null, so no ghost
  // has spliced into the flow yet. Measuring here (and only here) keeps the
  // geometry stable for the rest of the gesture, the way a once-per-drag
  // snapshot is meant to.
  useLayoutEffect(() => {
    if (draggingId === null) return;
    rects.current = measureCollapsed();
  }, [draggingId, measureCollapsed]);

  const computeDropTarget = useCallback(
    (draggedId: string, y: number): DropTarget | null =>
      resolveDropTarget(rects.current, draggedId, y, canDropRef.current),
    [],
  );

  // Read the live reorder callback through a ref so the window handlers below
  // can stay referentially stable (bound once, removed by the same reference)
  // without re-binding on every render the parent hands a fresh `onReorder`.
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // Best-effort release of the pointer capture taken at pickup. The capture is
  // a nicety (it suppresses text-selection and keeps touch events on the grip);
  // correctness no longer depends on it, because the move/up/cancel handlers
  // are bound to `window`, not the grip — so a mouse release that lands off the
  // grip (a desktop pointer has no implicit capture) is still caught.
  const releaseCapture = useCallback(() => {
    const el = captureEl.current;
    const pid = pointerId.current;
    if (el && pid !== null) {
      try {
        if (el.hasPointerCapture?.(pid)) el.releasePointerCapture(pid);
      } catch {
        // The capture may already be gone (released between a teardown trigger
        // and here) — nothing left to free.
      }
    }
  }, []);

  // Move/up/cancel run off `window`, bound for one drag's lifetime, so the
  // release is caught wherever the pointer ends up — not only when it happens
  // to land back on the grip. `reset` detaches them via `detachWindow`.
  const handleMove = useCallback(
    (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId || draggedIdRef.current === null)
        return;
      const d = e.clientY - startY.current;
      if (!armed.current) {
        if (Math.abs(d) < AXIS_LOCK) return;
        armed.current = true;
      }
      // Keep the page from scrolling / selecting text under the dragged row.
      if (e.cancelable) e.preventDefault();
      const draggedId = draggedIdRef.current;
      const target = computeDropTarget(draggedId, e.clientY);
      setDelta(d);
      setDropTarget(target);
      dropTargetRef.current = target;
    },
    [computeDropTarget],
  );

  const handleUp = useCallback(
    (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      const draggedId = draggedIdRef.current;
      const target = dropTargetRef.current;
      const moved = armed.current;
      releaseCapture();
      reset();
      if (moved && draggedId && target) {
        onReorderRef.current(draggedId, target.id, target.mode);
      }
    },
    [releaseCapture, reset],
  );

  // A browser-initiated `pointercancel` (the UA seized the pointer for its own
  // gesture) aborts the drag — it must NOT commit a half-finished move the way
  // a deliberate release does.
  const handleCancel = useCallback(
    (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      releaseCapture();
      reset();
    },
    [releaseCapture, reset],
  );

  const bindWindow = useCallback(() => {
    detachWindow.current?.();
    // `passive: false` so `handleMove` may `preventDefault` to block scroll.
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    detachWindow.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, [handleMove, handleUp, handleCancel]);

  const onPointerDown = useCallback(
    (id: string) => (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Keep the row's swipe gesture from arming on the same press.
      e.stopPropagation();
      const measured = measure();
      const index = measured.findIndex((r) => r.id === id);
      if (index === -1) return;
      // Seed `rects` with the pre-lift geometry as an immediate fallback; the
      // layout effect re-snapshots the collapsed layout once the row lifts.
      rects.current = measured;
      draggedIdRef.current = id;
      const node = containerRef.current?.querySelector<HTMLElement>(
        `[data-reorder-id="${CSS.escape(id)}"]`,
      );
      dragTop.current = node?.offsetTop ?? 0;
      startY.current = e.clientY;
      pointerId.current = e.pointerId;
      armed.current = false;
      captureEl.current = e.currentTarget;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture is best-effort; the window listeners catch the release
        // regardless, so a refusal here is harmless.
      }
      bindWindow();
      setDraggingId(id);
      setDelta(0);
      setDropTarget(null);
      dropTargetRef.current = null;
    },
    [measure, bindWindow],
  );

  const cancel = useCallback(() => {
    releaseCapture();
    reset();
  }, [releaseCapture, reset]);

  // Drop any still-bound window listeners if the component unmounts mid-drag.
  useEffect(() => () => detachWindow.current?.(), []);

  const rowStyle = useCallback(
    (id: string): CSSProperties => {
      if (!draggingId) return IDLE_ROW_STYLE;
      if (id === draggingId) {
        // Lift the row clean out of the list flow (so its slot collapses and
        // the ghost can take the place it'll land in) and float a shrunken,
        // translucent copy under the finger. `left/right: 0` spans the list;
        // `top` is the captured offset, nudged by the drag delta.
        return {
          position: "absolute",
          left: 0,
          right: 0,
          top: dragTop.current,
          transform: `translateY(${delta}px) scale(${DRAG_SCALE})`,
          transformOrigin: "center left",
          transition: "none",
          zIndex: 30,
          opacity: 0.82,
          boxShadow: "0 10px 28px rgba(0, 0, 0, 0.28)",
          borderRadius: "0.5rem",
          cursor: "grabbing",
        };
      }
      return IDLE_ROW_STYLE;
    },
    [draggingId, delta],
  );

  // Hand each row the same `DragHandleProps` object across renders so a
  // memoized row isn't forced to reconcile just because its handle props were
  // freshly allocated. The cache is rebuilt only when one of the composing
  // handlers changes identity.
  const handleCache = useRef<{
    deps: readonly unknown[];
    byId: Map<string, DragHandleProps>;
  }>({ deps: [], byId: new Map() });

  const dragHandleProps = useCallback(
    (id: string): DragHandleProps => {
      const cache = handleCache.current;
      const deps = [onPointerDown] as const;
      if (deps.some((d, i) => d !== cache.deps[i])) {
        cache.deps = deps;
        cache.byId = new Map();
      }
      let props = cache.byId.get(id);
      if (!props) {
        props = { onPointerDown: onPointerDown(id) };
        cache.byId.set(id, props);
      }
      return props;
    },
    [onPointerDown],
  );

  return {
    containerRef,
    draggingId,
    dropTarget,
    rowStyle,
    dragHandleProps,
    cancel,
  };
}

// Resolve a finger position to a drop target against a measured row list: the
// row it's over, split into before / into / after zones, with rows the dragged
// item can't land on (itself or its own descendants) skipped. Pure over the
// passed geometry so it's unit-testable; the hook feeds it the collapsed,
// dragged-row-excluded snapshot.
export function resolveDropTarget(
  list: readonly Rect[],
  draggedId: string,
  y: number,
  canDrop: (draggedId: string, targetId: string) => boolean,
): DropTarget | null {
  for (const r of list) {
    if (y < r.top || y >= r.top + r.height) continue;
    if (r.id !== draggedId && canDrop(draggedId, r.id)) {
      const rel = (y - r.top) / r.height;
      const mode: DropMode =
        rel < EDGE_ZONE ? "before" : rel > 1 - EDGE_ZONE ? "after" : "into";
      return { id: r.id, mode };
    }
    // Over the dragged row (or a forbidden one): fall back to the nearest
    // droppable neighbour, before/after by which half the finger is in.
    return nearestNeighbour(list, draggedId, r, y);
  }
  // Past the ends of the list: clamp to the first / last droppable row.
  const first = list.find(
    (r) => r.id !== draggedId && canDrop(draggedId, r.id),
  );
  const last = [...list]
    .reverse()
    .find((r) => r.id !== draggedId && canDrop(draggedId, r.id));
  if (list.length > 0 && first && last) {
    return y < list[0]!.top
      ? { id: first.id, mode: "before" }
      : { id: last.id, mode: "after" };
  }
  return null;
}

// The nearest droppable row to the dragged one, picked when the finger sits
// over the dragged row itself: above its midpoint drops before it, below
// drops after it.
function nearestNeighbour(
  list: readonly Rect[],
  draggedId: string,
  over: Rect,
  y: number,
): DropTarget | null {
  const above = y < over.top + over.height / 2;
  // Walk outward from the over-row to the first row the item can land on.
  const idx = list.findIndex((r) => r.id === over.id);
  const order = above
    ? [...range(idx - 1, -1, -1), ...range(idx + 1, list.length, 1)]
    : [...range(idx + 1, list.length, 1), ...range(idx - 1, -1, -1)];
  for (const i of order) {
    const r = list[i]!;
    if (r.id !== draggedId) {
      return { id: r.id, mode: above ? "before" : "after" };
    }
  }
  return null;
}

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(i);
  return out;
}
