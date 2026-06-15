// Pointer-driven vertical reorder for the checklist. A grip handle on each
// row arms the gesture (kept off the row body so it never collides with the
// horizontal swipe-to-archive/delete). While dragging, the picked-up row
// follows the finger with a live transform and the rows it crosses slide out
// of the way; on release the caller commits the new order through `onReorder`.
//
// The list isn't reordered in React state mid-drag — row positions are
// measured once at pointer-down and the displacement is computed from that
// snapshot, so the math stays stable until the single commit on drop.

import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";

// Vertical movement before the drag commits to actually moving rows, so a
// stationary press on the handle never nudges the list.
const AXIS_LOCK = 6;

interface Rect {
  id: string;
  top: number;
  height: number;
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
  rowStyle: (id: string) => CSSProperties;
  dragHandleProps: (id: string) => DragHandleProps;
}

export function useListReorder(
  onReorder: (id: string, toIndex: number) => void,
): ListReorder {
  const containerRef = useRef<HTMLUListElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [delta, setDelta] = useState(0);
  const [targetIndex, setTargetIndex] = useState(-1);

  const rects = useRef<Rect[]>([]);
  const dragIndex = useRef(-1);
  const startY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const armed = useRef(false);

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
    setTargetIndex(-1);
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
      setTargetIndex(index);
      setDelta(0);
    },
    [measure],
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    if (pointerId.current !== e.pointerId || dragIndex.current === -1) return;
    e.stopPropagation();
    const d = e.clientY - startY.current;
    if (!armed.current) {
      if (Math.abs(d) < AXIS_LOCK) return;
      armed.current = true;
    }
    e.preventDefault();

    const list = rects.current;
    const from = dragIndex.current;
    const dragged = list[from]!;
    const center = dragged.top + dragged.height / 2 + d;

    let next = from;
    for (let i = from + 1; i < list.length; i++) {
      const c = list[i]!.top + list[i]!.height / 2;
      if (center > c) next = i;
      else break;
    }
    for (let i = from - 1; i >= 0; i--) {
      const c = list[i]!.top + list[i]!.height / 2;
      if (center < c) next = i;
      else break;
    }

    setDelta(d);
    setTargetIndex(next);
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (pointerId.current !== e.pointerId) return;
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
      const from = dragIndex.current;
      const to = targetIndex;
      const id = draggingId;
      reset();
      if (id && to !== -1 && to !== from) onReorder(id, to);
    },
    [draggingId, targetIndex, onReorder, reset],
  );

  const rowStyle = useCallback(
    (id: string): CSSProperties => {
      if (!draggingId) return {};
      if (id === draggingId) {
        return {
          transform: `translateY(${delta}px)`,
          transition: "none",
          position: "relative",
          zIndex: 20,
          cursor: "grabbing",
        };
      }
      const list = rects.current;
      const from = dragIndex.current;
      const j = list.findIndex((r) => r.id === id);
      if (j === -1 || from === -1) return {};
      const h = list[from]?.height ?? 0;
      let shift = 0;
      if (from < targetIndex && j > from && j <= targetIndex) shift = -h;
      else if (from > targetIndex && j < from && j >= targetIndex) shift = h;
      return {
        transform: `translateY(${shift}px)`,
        transition: "transform 150ms ease",
      };
    },
    [draggingId, delta, targetIndex],
  );

  const dragHandleProps = useCallback(
    (id: string): DragHandleProps => ({
      onPointerDown: onPointerDown(id),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    }),
    [onPointerDown, onPointerMove, onPointerUp],
  );

  return { containerRef, draggingId, rowStyle, dragHandleProps };
}
