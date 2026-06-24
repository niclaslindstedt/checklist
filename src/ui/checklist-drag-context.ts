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
  useEffect,
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

// A dragged item is either a single checklist (a bare id) or a whole folder.
// Both paths carry the dragged thing as one string — the desktop HTML5 drag
// stamps it on `dataTransfer`, the touch path hands it to `begin` — so a folder
// drag is encoded as its id under this prefix and `parseDragId` splits the kind
// back off at the drop. A folder can only be dropped on a namespace (it moves
// the folder and every list inside it there); over a folder / the ungrouped
// zone / the archive it's a no-op.
export const FOLDER_DRAG_PREFIX = "folder:";

export type DragKind = "checklist" | "folder";

/** Encode a folder id as the drag payload for a whole-folder drag. */
export function folderDragId(folderId: string): string {
  return `${FOLDER_DRAG_PREFIX}${folderId}`;
}

/** Split a drag payload back into its kind and the underlying id. */
export function parseDragId(raw: string): { kind: DragKind; id: string } {
  if (raw.startsWith(FOLDER_DRAG_PREFIX)) {
    return { kind: "folder", id: raw.slice(FOLDER_DRAG_PREFIX.length) };
  }
  return { kind: "checklist", id: raw };
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
// A monotonically increasing "abort" signal the app bumps to tear down any
// in-flight filing drag from outside the gesture — e.g. a sync-conflict modal
// has surfaced over the list and seized the screen. The provider raises it; the
// active row releases its pointer capture and stops blocking scroll, and the
// native HTML5 drop zones in the side menu drop their lift styling, even though
// no pointerup/cancel (or `dragend`) will arrive on a row the interruption
// unmounted.
export const DragAbortContext = createContext<number>(0);
// What kind of thing the touch drag is currently carrying (null when idle), so
// drop targets can suppress a highlight they'd never accept — a folder being
// dragged lights up only namespace rows, not other folders / the archive.
export const DragKindContext = createContext<DragKind | null>(null);

/** The drop target currently under the finger (its `data-checklist-drop` value). */
export function useChecklistDropKey(): string | null {
  return useContext(DropKeyContext);
}

/** The kind of item the touch drag is carrying right now (null when idle). */
export function useChecklistDragKind(): DragKind | null {
  return useContext(DragKindContext);
}

/** The current drag-abort generation; changes when the app aborts in-flight
 * drags (a sync conflict, a background reload). Native HTML5 drop zones watch
 * it to clear a lift that `dragend` would otherwise never resolve. */
export function useChecklistDragAbort(): number {
  return useContext(DragAbortContext);
}

/** Commit a drop of `checklistId` onto the target identified by `key`. */
export function useChecklistDrop(): (checklistId: string, key: string) => void {
  const onDrop = useContext(OnDropContext);
  return onDrop ?? (() => {});
}

export type TouchDragHandlers = Partial<{
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
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
  const abortGen = useContext(DragAbortContext);
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
  // Detaches the window move/up/cancel listeners bound for the lifetime of the
  // active gesture (see `bindWindow`). Held on a ref so `cleanup` can drop them
  // without depending on the handler identities.
  const detachWindow = useRef<(() => void) | null>(null);

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
    detachWindow.current?.();
    detachWindow.current = null;
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

  // Tear the gesture down when the app aborts mid-drag (a sync-conflict modal
  // took over, a background reload swapped the list). The user is still
  // holding — no pointerup has fired — so `cleanup` here drops the chip and
  // detaches the window listeners now, both so the lifted list doesn't hover
  // over the modal and so a later release can't commit a move into the
  // unresolved conflict. `active` is false on mount and whenever idle, so the
  // initial run (and runs while no drag is live) are no-ops.
  useEffect(() => {
    if (active.current) cleanup();
  }, [abortGen, cleanup]);

  const engage = useCallback(
    (x: number, y: number) => {
      active.current = true;
      setDragging(true);
      const el = targetEl.current;
      if (el && pointerId.current !== null) {
        try {
          el.setPointerCapture(pointerId.current);
        } catch {
          // Capture is best-effort — it keeps touch events on the row and
          // suppresses text selection — but correctness no longer depends on
          // it: move/up/cancel live on `window`, so a release is caught
          // wherever the pointer ends up even when capture is refused.
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

  // Move / up / cancel run off `window` for the gesture's lifetime, not the
  // row, so the press is tracked and the release caught wherever the pointer
  // travels. A pen/touch point that drifts off the row — or a browser that
  // refused the pointer capture `engage` requests — would otherwise never
  // deliver the `pointerup`, leaving the lifted list frozen mid-air. Bound on
  // pointer-down (so even the pre-latch move/up is seen), dropped by `cleanup`.
  const handleMove = useCallback(
    (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      if (!active.current) {
        // Moved past the slop before the press latched → it's a scroll or a
        // swipe; stand down and leave the existing gesture untouched.
        if (
          Math.abs(e.clientX - startX.current) > MOVE_SLOP ||
          Math.abs(e.clientY - startY.current) > MOVE_SLOP
        ) {
          clearTimer();
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      hitTest(e.clientX, e.clientY);
    },
    [clearTimer, hitTest],
  );

  const handleUp = useCallback(
    (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      if (active.current) {
        justDragged.current = true;
        actions?.commit();
      }
      cleanup();
    },
    [actions, cleanup],
  );

  // A browser-initiated `pointercancel` (the UA seized the pointer for its own
  // gesture) aborts the drag — it must not commit a move the way a release does.
  const handleCancel = useCallback(
    (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return;
      if (active.current) actions?.cancel();
      cleanup();
    },
    [actions, cleanup],
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
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") return;
      pointerId.current = e.pointerId;
      targetEl.current = e.currentTarget;
      startX.current = e.clientX;
      startY.current = e.clientY;
      active.current = false;
      justDragged.current = false;
      const { clientX: x, clientY: y } = e;
      clearTimer();
      // Bind the rest of the gesture to `window` up front so even a pre-latch
      // move or a quick tap-release is tracked off the row.
      bindWindow();
      timer.current = window.setTimeout(() => engage(x, y), LONG_PRESS_MS);
    },
    [bindWindow, clearTimer, engage],
  );

  // Swallow the click that trails a drag so releasing over a folder files the
  // list instead of also selecting it.
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (justDragged.current) {
      e.preventDefault();
      e.stopPropagation();
      justDragged.current = false;
    }
  }, []);

  // Drop any still-bound window listeners if the row unmounts mid-drag.
  useEffect(() => () => detachWindow.current?.(), []);

  if (!enabled) return { handlers: {}, dragging: false };

  return { handlers: { onPointerDown, onClickCapture }, dragging };
}
