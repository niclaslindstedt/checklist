// Touch drag-and-drop for filing checklists into folders, namespaces, or the
// archive. Native HTML5 drag (`draggable` + `dragstart`/`drop`) only works with
// a mouse, so on a touchscreen this provides the equivalent gesture: **press
// and hold** a list to pick it up, drag it over a target, and release to drop
// it. The desktop HTML5 path is left as-is in the side menu; this layer is the
// touch-only complement, gated by the caller to coarse pointers.
//
// ## How it coexists with swipe-to-delete
//
// A checklist row already swipes left to latch open a trash button (via
// `useSwipeReveal`), which commits to a horizontal gesture only after a few px
// of movement. The long-press here fires from *holding still*: if the finger
// moves past a small slop before the timer elapses it's a swipe or a scroll
// and we bail, leaving the existing gesture untouched. Once the press latches
// we capture the pointer (so the inner swipe element stops seeing moves) and
// block page scroll for the rest of the drag.
//
// ## Drop targets
//
// A drop target marks itself with the `data-checklist-drop` attribute carrying
// its folder id (or `CHECKLIST_DROP_ROOT` for the ungrouped zone,
// `CHECKLIST_DROP_ARCHIVE` for the Archive button, `ns:<slug>` for a namespace
// row). The dragged row owns the pointer, so it hit-tests with
// `elementFromPoint` on every move and reports the target under the finger; the
// provider hands that key to `onDrop`, which resolves it to the right action.
// Targets read the active key via `useChecklistDropKey` to paint a highlight.
//
// The non-component half — the contexts, the `useTouchChecklistDrag` hook, and
// the drop-target constants — lives in `checklist-drag-context.ts`.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import { ChecklistIcon } from "./icons.tsx";
import { useReportDragActivity } from "./drag-activity.ts";
import {
  ActionsContext,
  DropKeyContext,
  OnDropContext,
  useTouchChecklistDrag,
  type DragActions,
} from "./checklist-drag-context.ts";

export function ChecklistDragProvider({
  onDrop,
  children,
}: {
  // Fired when a list is released over a drop target. `key` is the target's
  // `data-checklist-drop` value (folder id / `CHECKLIST_DROP_ROOT` /
  // `CHECKLIST_DROP_ARCHIVE` / `ns:<slug>`); the caller resolves it to an
  // action.
  onDrop: (checklistId: string, key: string) => void;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState<{ title: string } | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  // Latest fingertip position, kept on a ref so the callback ref can place the
  // chip the instant it mounts (see `setGhostRef`).
  const ghostPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Live mirrors so the memoised actions read current values without being
  // rebuilt (which would re-fire the touch handlers' closures).
  const checklistIdRef = useRef<string | null>(null);
  const dropKeyRef = useRef<string | null>(null);

  // While a list is picked up, report the drag so the document-level
  // pull-to-refresh stands down — dragging a list downward to a target would
  // otherwise arm a refresh at the same time.
  const reportDrag = useReportDragActivity();
  const isDragging = dragging !== null;
  useEffect(() => {
    reportDrag(isDragging);
    return () => {
      if (isDragging) reportDrag(false);
    };
  }, [isDragging, reportDrag]);

  // Sit the chip just above the fingertip, horizontally centred on it.
  const applyGhostTransform = useCallback((el: HTMLDivElement) => {
    const { x, y } = ghostPos.current;
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -150%)`;
  }, []);

  const positionGhost = useCallback(
    (x: number, y: number) => {
      ghostPos.current = { x, y };
      const el = ghostRef.current;
      if (el) applyGhostTransform(el);
    },
    [applyGhostTransform],
  );

  // Callback ref: place the chip in the same commit it mounts, before the
  // browser paints. `begin` records the pickup point first, so the chip is
  // never shown at its `top-0 left-0` default while waiting for the first move.
  const setGhostRef = useCallback(
    (el: HTMLDivElement | null) => {
      ghostRef.current = el;
      if (el) applyGhostTransform(el);
    },
    [applyGhostTransform],
  );

  const actions = useMemo<DragActions>(
    () => ({
      begin(checklistId, title, x, y) {
        checklistIdRef.current = checklistId;
        dropKeyRef.current = null;
        // Record the pickup point so the chip's callback ref can place it the
        // moment it mounts, rather than flashing at the top-left default.
        positionGhost(x, y);
        setDragging({ title });
        setDropKey(null);
      },
      hover(key, x, y) {
        positionGhost(x, y);
        if (dropKeyRef.current !== key) {
          dropKeyRef.current = key;
          setDropKey(key);
        }
      },
      commit() {
        const checklistId = checklistIdRef.current;
        const key = dropKeyRef.current;
        if (checklistId && key !== null) onDrop(checklistId, key);
        checklistIdRef.current = null;
        dropKeyRef.current = null;
        setDragging(null);
        setDropKey(null);
      },
      cancel() {
        checklistIdRef.current = null;
        dropKeyRef.current = null;
        setDragging(null);
        setDropKey(null);
      },
    }),
    [onDrop, positionGhost],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <OnDropContext.Provider value={onDrop}>
        <DropKeyContext.Provider value={dropKey}>
          {children}
          {dragging && (
            <div
              ref={setGhostRef}
              aria-hidden
              className="pointer-events-none fixed top-0 left-0 z-[100] flex max-w-[70vw] items-center gap-2 rounded-[var(--radius)] border border-accent/40 bg-surface-2 px-3 py-1.5 text-sm text-fg-bright shadow-lg"
            >
              <ChecklistIcon className="h-4 w-4 shrink-0 text-accent" />
              <span className="truncate">{dragging.title}</span>
            </div>
          )}
        </DropKeyContext.Provider>
      </OnDropContext.Provider>
    </ActionsContext.Provider>
  );
}

// The wrapper a draggable checklist row renders through: it carries the desktop
// HTML5 drag props (when `draggable`) and the touch long-press handlers (when
// `enabled`), and dims itself while it's the one being dragged.
export function ChecklistDragItem({
  checklistId,
  title,
  enabled,
  draggable,
  dragging: desktopDragging,
  onDragStart,
  onDragEnd,
  className,
  children,
}: {
  checklistId: string;
  title: string;
  /** Touch long-press drag is wired (coarse pointer). */
  enabled: boolean;
  /** Desktop HTML5 drag is wired (fine pointer). */
  draggable?: boolean;
  /** The desktop drag state for this row, for the lift styling. */
  dragging?: boolean;
  onDragStart?: (e: ReactDragEvent) => void;
  onDragEnd?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const { handlers, dragging: touchDragging } = useTouchChecklistDrag(
    checklistId,
    title,
    enabled,
  );
  const isDragging = enabled ? touchDragging : Boolean(desktopDragging);
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      {...handlers}
      className={`${className ?? ""} ${isDragging ? "opacity-40" : ""}`.trim()}
    >
      {children}
    </div>
  );
}
