import { useCallback, useEffect, useRef, useState } from "react";

import type { MenuButtonPosition } from "../../settings/types.ts";
import {
  clampRect,
  MENU_BUTTON_MARGIN,
  MENU_BUTTON_SIZE,
  rectToPosition,
  restingRect,
} from "../sideMenuPosition.ts";

// Pointer-driven dragging for the floating navigation button. The button
// follows the finger / cursor 1:1 while dragging, then snaps to the nearer
// edge on release (the glide back is a CSS transition `SideMenu` toggles
// off while a drag is live). A press that never travels past
// `DRAG_THRESHOLD` is treated as a tap and left for the button's own click
// handler to toggle the drawer — so keyboard activation keeps working too.

const DRAG_THRESHOLD = 6;

type Rect = { left: number; top: number };

function readViewport(): { vw: number; vh: number } {
  return { vw: window.innerWidth, vh: window.innerHeight };
}

export interface DraggableMenuButton {
  /** Inline `left` / `top` for the fixed button — live while dragging. */
  style: { left: string; top: string };
  /** True while a real drag is in flight (used to suppress the transition). */
  dragging: boolean;
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
  };
  /**
   * Returns true (and clears the flag) when the click that just fired was
   * the tail of a drag, so the caller can swallow it instead of toggling.
   */
  consumeDragClick: () => boolean;
}

export function useDraggableMenuButton(
  position: MenuButtonPosition,
  onPositionChange: (next: MenuButtonPosition) => void,
): DraggableMenuButton {
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined" ? { vw: 0, vh: 0 } : readViewport(),
  );
  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The live top-left while dragging; null when resting at `position`.
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const drag = useRef<{
    pointerId: number;
    offX: number;
    offY: number;
    moved: boolean;
  } | null>(null);
  // Set when a drag ends so the synthetic click can be ignored once.
  const draggedRef = useRef(false);

  const resting = restingRect(
    position,
    viewport.vw,
    viewport.vh,
    MENU_BUTTON_SIZE,
    MENU_BUTTON_MARGIN,
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      draggedRef.current = false;
      const rect = e.currentTarget.getBoundingClientRect();
      drag.current = {
        pointerId: e.pointerId,
        offX: e.clientX - rect.left,
        offY: e.clientY - rect.top,
        moved: false,
      };
      // Capture so the drag keeps tracking even if the pointer outruns the
      // button (guarded — jsdom and very old engines lack the API).
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const { vw, vh } = readViewport();
      const left = e.clientX - d.offX;
      const top = e.clientY - d.offY;
      if (!d.moved) {
        const far =
          Math.abs(left - resting.left) > DRAG_THRESHOLD ||
          Math.abs(top - resting.top) > DRAG_THRESHOLD;
        if (!far) return;
        d.moved = true;
        draggedRef.current = true;
      }
      setDragRect(
        clampRect(left, top, vw, vh, MENU_BUTTON_SIZE, MENU_BUTTON_MARGIN),
      );
    },
    [resting.left, resting.top],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
      if (!d.moved) {
        setDragRect(null);
        return;
      }
      const { vw, vh } = readViewport();
      const final = dragRect ?? resting;
      onPositionChange(
        rectToPosition(
          final.left,
          final.top,
          vw,
          vh,
          MENU_BUTTON_SIZE,
          MENU_BUTTON_MARGIN,
        ),
      );
      setDragRect(null);
    },
    [dragRect, resting, onPositionChange],
  );

  const consumeDragClick = useCallback(() => {
    if (!draggedRef.current) return false;
    draggedRef.current = false;
    return true;
  }, []);

  const rect = dragRect ?? resting;
  return {
    style: { left: `${rect.left}px`, top: `${rect.top}px` },
    dragging: dragRect !== null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
    consumeDragClick,
  };
}
