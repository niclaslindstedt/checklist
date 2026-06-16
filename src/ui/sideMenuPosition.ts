// Pure geometry for the draggable floating navigation button. Translates
// between the persisted `MenuButtonPosition` (an edge + a 0..1 vertical
// fraction) and concrete top-left pixel coordinates against a viewport,
// and back again when a drag ends. Kept free of React and the DOM so the
// snap / clamp maths can be unit-tested in isolation; `SideMenu` and its
// drag hook own the event wiring.

import type { MenuButtonPosition } from "../settings/types.ts";

// The button's footprint (h-11 w-11 → 44px) and the gap it keeps from the
// viewport edges (left-3 → 0.75rem → 12px). Mirrored by the Tailwind
// classes in `SideMenu`; kept here so the maths and the styling agree.
export const MENU_BUTTON_SIZE = 44;
export const MENU_BUTTON_MARGIN = 12;

/** Clamp `n` into the inclusive unit interval [0, 1]. */
export function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** The vertical pixels the button's top edge can travel between margins. */
function verticalTravel(vh: number, size: number, margin: number): number {
  return Math.max(0, vh - 2 * margin - size);
}

/** The button's resting top-left pixel coordinates for a saved position. */
export function restingRect(
  pos: MenuButtonPosition,
  vw: number,
  vh: number,
  size = MENU_BUTTON_SIZE,
  margin = MENU_BUTTON_MARGIN,
): { left: number; top: number } {
  const left = pos.side === "left" ? margin : vw - margin - size;
  const top = margin + clampUnit(pos.y) * verticalTravel(vh, size, margin);
  return { left, top };
}

/** Keep a free-dragged top-left inside the margin-inset viewport box. */
export function clampRect(
  left: number,
  top: number,
  vw: number,
  vh: number,
  size = MENU_BUTTON_SIZE,
  margin = MENU_BUTTON_MARGIN,
): { left: number; top: number } {
  const maxLeft = Math.max(margin, vw - margin - size);
  const maxTop = Math.max(margin, vh - margin - size);
  return {
    left: Math.min(maxLeft, Math.max(margin, left)),
    top: Math.min(maxTop, Math.max(margin, top)),
  };
}

/**
 * Snap a dropped top-left back into a saveable `MenuButtonPosition`: the
 * nearer horizontal edge (by the button's centre) plus the vertical
 * fraction it came to rest at.
 */
export function rectToPosition(
  left: number,
  top: number,
  vw: number,
  vh: number,
  size = MENU_BUTTON_SIZE,
  margin = MENU_BUTTON_MARGIN,
): MenuButtonPosition {
  const side = left + size / 2 < vw / 2 ? "left" : "right";
  const travel = verticalTravel(vh, size, margin);
  const y = travel > 0 ? clampUnit((top - margin) / travel) : 0.5;
  return { side, y };
}
