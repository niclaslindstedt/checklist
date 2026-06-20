// Pointer-driven drag for the checklist. A grip handle on each row arms the
// gesture (kept off the row body so it never collides with the horizontal
// swipe-to-archive/delete). While dragging, the picked-up row follows the
// finger vertically and a drop indicator tracks where it would land: the row
// it's over is split into three zones — the top edge drops it *before* that
// row, the bottom edge *after* it, and the middle *into* it as a sub-item.
// So reordering and nesting are the same gesture; on release the caller
// commits through `onReorder(draggedId, targetId, mode)`.
//
// Row positions are measured once at pointer-down and the drop target is
// computed from that static snapshot plus the finger position, so the math
// stays stable until the single commit on drop.

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";

import type { DropMode } from "../../domain/checklists.ts";

// Vertical movement before the drag commits to actually moving rows, so a
// stationary press on the handle never nudges the list.
const AXIS_LOCK = 6;

// Fraction of a row's height at its top / bottom edge that drops the dragged
// item *beside* it (before / after); the middle band drops it *into* the row
// as a sub-item.
const EDGE_ZONE = 0.3;

// Shared, stable "no transform" style handed to every row while no drag is
// in progress. Returning one frozen reference (rather than a fresh `{}` per
// row per render) lets the memoized rows skip re-rendering on an unrelated
// edit — only the row whose item changed reconciles.
const IDLE_ROW_STYLE: CSSProperties = Object.freeze({});

interface Rect {
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

export interface DragHandleProps {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
}

export interface ListReorder {
  containerRef: RefObject<HTMLUListElement | null>;
  draggingId: string | null;
  /** The current drop target + mode, for the row to draw its indicator. */
  dropTarget: DropTarget | null;
  rowStyle: (id: string) => CSSProperties;
  dragHandleProps: (id: string) => DragHandleProps;
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
  const dragIndex = useRef(-1);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const armed = useRef(false);
  // Mirror the live drop target into a ref so `onPointerUp` reads the latest
  // without re-binding the handler on every pointermove.
  const dropTargetRef = useRef<DropTarget | null>(null);
  const canDropRef = useRef(canDrop);
  canDropRef.current = canDrop;

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

  const reset = useCallback(() => {
    setDraggingId(null);
    setDelta(0);
    setDropTarget(null);
    dropTargetRef.current = null;
    dragIndex.current = -1;
    pointerId.current = null;
    armed.current = false;
  }, []);

  const onPointerDown = useCallback(
    (id: string) => (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Keep the row's swipe gesture from arming on the same press.
      e.stopPropagation();
      const measured = measure();
      const index = measured.findIndex((r) => r.id === id);
      if (index === -1) return;
      rects.current = measured;
      dragIndex.current = index;
      startY.current = e.clientY;
      pointerId.current = e.pointerId;
      armed.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraggingId(id);
      setDelta(0);
      setDropTarget(null);
      dropTargetRef.current = null;
    },
    [measure],
  );

  // Resolve the finger position to a drop target: the row it's over, split
  // into before / into / after zones. Rows the dragged item can't land on
  // (itself or its own descendants) are skipped.
  const computeDropTarget = useCallback(
    (draggedId: string, y: number): DropTarget | null => {
      const list = rects.current;
      let candidate: DropTarget | null = null;
      for (const r of list) {
        if (y < r.top || y >= r.top + r.height) continue;
        if (r.id !== draggedId && canDropRef.current(draggedId, r.id)) {
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
        (r) => r.id !== draggedId && canDropRef.current(draggedId, r.id),
      );
      const last = [...list]
        .reverse()
        .find((r) => r.id !== draggedId && canDropRef.current(draggedId, r.id));
      if (list.length > 0 && first && last) {
        candidate =
          y < list[0]!.top
            ? { id: first.id, mode: "before" }
            : { id: last.id, mode: "after" };
      }
      return candidate;
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (pointerId.current !== e.pointerId || dragIndex.current === -1) return;
      e.stopPropagation();
      const d = e.clientY - startY.current;
      if (!armed.current) {
        if (Math.abs(d) < AXIS_LOCK) return;
        armed.current = true;
      }
      e.preventDefault();
      const draggedId = rects.current[dragIndex.current]!.id;
      const target = computeDropTarget(draggedId, e.clientY);
      setDelta(d);
      setDropTarget(target);
      dropTargetRef.current = target;
    },
    [computeDropTarget],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (pointerId.current !== e.pointerId) return;
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      const draggedId =
        dragIndex.current === -1 ? null : rects.current[dragIndex.current]!.id;
      const target = dropTargetRef.current;
      const moved = armed.current;
      reset();
      if (moved && draggedId && target) {
        onReorder(draggedId, target.id, target.mode);
      }
    },
    [onReorder, reset],
  );

  const rowStyle = useCallback(
    (id: string): CSSProperties => {
      if (!draggingId) return IDLE_ROW_STYLE;
      if (id === draggingId) {
        return {
          transform: `translateY(${delta}px)`,
          transition: "none",
          position: "relative",
          zIndex: 20,
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
      const deps = [onPointerDown, onPointerMove, onPointerUp] as const;
      if (deps.some((d, i) => d !== cache.deps[i])) {
        cache.deps = deps;
        cache.byId = new Map();
      }
      let props = cache.byId.get(id);
      if (!props) {
        props = {
          onPointerDown: onPointerDown(id),
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        };
        cache.byId.set(id, props);
      }
      return props;
    },
    [onPointerDown, onPointerMove, onPointerUp],
  );

  return { containerRef, draggingId, dropTarget, rowStyle, dragHandleProps };
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
