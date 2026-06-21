// The non-component half of the touch drag-to-target layer (see
// `checklist-drag.tsx` for the provider + item components): the drop-target
// contract, the two contexts, and the press-and-hold pointer hook. Split out
// so the `.tsx` file exports only components (React Fast Refresh).
//
// See `checklist-drag.tsx`'s header for how the gesture works and coexists
// with swipe-to-delete.

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

// Drop-target keys carried in the `data-checklist-drop` attribute. The dragged
// row reads the key under the finger and the provider hands it to `onDrop`,
// which resolves it to an action:
//   - `CHECKLIST_DROP_ROOT`    — the "ungrouped" zone (take the list out of its folder)
//   - `CHECKLIST_DROP_ARCHIVE` — the Archive button (archive the list)
//   - `ns:<slug>`              — a namespace row (move the list to that namespace)
//   - anything else            — a folder id (file the list into that folder)
// The namespace/archive targets live in the side menu only.
export const CHECKLIST_DROP_ROOT = "__root__";
export const CHECKLIST_DROP_ARCHIVE = "__archive__";
export const CHECKLIST_DROP_NS_PREFIX = "ns:";
export const CHECKLIST_DROP_ATTR = "data-checklist-drop";

/** The drop key for a namespace row, by its slug. */
export function checklistDropNamespaceKey(slug: string): string {
  return `${CHECKLIST_DROP_NS_PREFIX}${slug}`;
}

// Hold this long without moving to pick a list up; abort the press if the
// finger travels more than this many px first (it's a scroll or a swipe).
const LONG_PRESS_MS = 320;
const MOVE_SLOP = 10;

export type DragActions = {
  begin: (checklistId: string, title: string, x: number, y: number) => void;
  hover: (key: string | null, x: number, y: number) => void;
  commit: () => void;
  cancel: () => void;
};

// Split into two contexts so a draggable row (needs the stable action
// callbacks) never re-renders when the hovered target changes — only the drop
// targets, which read the key, do.
export const ActionsContext = createContext<DragActions | null>(null);
export const DropKeyContext = createContext<string | null>(null);
// The resolver both the touch and the desktop HTML5 path commit a drop
// through, so a drop is handled identically however it was made.
export const OnDropContext = createContext<
  ((checklistId: string, key: string) => void) | null
>(null);

/** The drop target currently under the finger (its `data-checklist-drop` value). */
export function useChecklistDropKey(): string | null {
  return useContext(DropKeyContext);
}

/** Commit a drop of `checklistId` onto the target identified by `key`. */
export function useChecklistDrop(): (checklistId: string, key: string) => void {
  const onDrop = useContext(OnDropContext);
  return onDrop ?? (() => {});
}

export type TouchDragHandlers = Partial<{
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (e: ReactMouseEvent) => void;
}>;

// Pointer (touch/pen) long-press drag for one checklist. Returns handlers to
// spread on the row wrapper and a `dragging` flag for the caller's lift
// styling. A no-op (handlers omitted) when `enabled` is false — the desktop
// HTML5 path owns the gesture there.
export function useTouchChecklistDrag(
  checklistId: string,
  title: string,
  enabled: boolean,
): { handlers: TouchDragHandlers; dragging: boolean } {
  const actions = useContext(ActionsContext);
  const [dragging, setDragging] = useState(false);

  const timer = useRef<number | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const pointerId = useRef<number | null>(null);
  const targetEl = useRef<HTMLElement | null>(null);
  const justDragged = useRef(false);
  // Non-passive scroll blocker installed only while a drag is live.
  const blockScroll = useRef<(e: TouchEvent) => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hitTest = useCallback(
    (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      const target = el?.closest(`[${CHECKLIST_DROP_ATTR}]`);
      actions?.hover(target?.getAttribute(CHECKLIST_DROP_ATTR) ?? null, x, y);
    },
    [actions],
  );

  const cleanup = useCallback(() => {
    clearTimer();
    const el = targetEl.current;
    const id = pointerId.current;
    if (el && id !== null && el.hasPointerCapture?.(id)) {
      try {
        el.releasePointerCapture(id);
      } catch {
        // capture already gone — fine
      }
    }
    document.removeEventListener("touchmove", blockScroll.current);
    active.current = false;
    pointerId.current = null;
    setDragging(false);
  }, [clearTimer]);

  const engage = useCallback(
    (x: number, y: number) => {
      active.current = true;
      setDragging(true);
      const el = targetEl.current;
      if (el && pointerId.current !== null) {
        try {
          el.setPointerCapture(pointerId.current);
        } catch {
          // some browsers reject capture mid-gesture — drag still works
        }
      }
      blockScroll.current = (e: TouchEvent) => e.preventDefault();
      document.addEventListener("touchmove", blockScroll.current, {
        passive: false,
      });
      navigator.vibrate?.(8);
      actions?.begin(checklistId, title, x, y);
      hitTest(x, y);
    },
    [actions, hitTest, checklistId, title],
  );

  if (!enabled) return { handlers: {}, dragging: false };

  const handlers: TouchDragHandlers = {
    onPointerDown(e) {
      if (e.pointerType === "mouse") return;
      pointerId.current = e.pointerId;
      targetEl.current = e.currentTarget;
      startX.current = e.clientX;
      startY.current = e.clientY;
      active.current = false;
      justDragged.current = false;
      const { clientX: x, clientY: y } = e;
      clearTimer();
      timer.current = window.setTimeout(() => engage(x, y), LONG_PRESS_MS);
    },
    onPointerMove(e) {
      if (pointerId.current !== e.pointerId) return;
      if (!active.current) {
        // Moved before the press latched → it's a scroll or a swipe; stand down.
        if (
          Math.abs(e.clientX - startX.current) > MOVE_SLOP ||
          Math.abs(e.clientY - startY.current) > MOVE_SLOP
        ) {
          clearTimer();
        }
        return;
      }
      e.preventDefault();
      hitTest(e.clientX, e.clientY);
    },
    onPointerUp(e) {
      if (pointerId.current !== e.pointerId) return;
      if (active.current) {
        e.preventDefault();
        justDragged.current = true;
        actions?.commit();
      }
      cleanup();
    },
    onPointerCancel(e) {
      if (pointerId.current !== e.pointerId) return;
      if (active.current) actions?.cancel();
      cleanup();
    },
    // Swallow the click that trails a drag so releasing over a folder files the
    // list instead of also selecting it.
    onClickCapture(e) {
      if (justDragged.current) {
        e.preventDefault();
        e.stopPropagation();
        justDragged.current = false;
      }
    },
  };

  return { handlers, dragging };
}
