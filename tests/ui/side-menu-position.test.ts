import { describe, expect, it } from "vitest";

import {
  clampRect,
  clampUnit,
  MENU_BUTTON_MARGIN,
  MENU_BUTTON_SIZE,
  rectToPosition,
  restingRect,
} from "../../src/ui/sideMenuPosition.ts";

const VW = 400;
const VH = 800;
const M = MENU_BUTTON_MARGIN;
const S = MENU_BUTTON_SIZE;

describe("clampUnit", () => {
  it("clamps into [0, 1] and rejects non-finite input", () => {
    expect(clampUnit(0.4)).toBe(0.4);
    expect(clampUnit(-1)).toBe(0);
    expect(clampUnit(2)).toBe(1);
    expect(clampUnit(Number.NaN)).toBe(0);
  });
});

describe("restingRect", () => {
  it("pins to the left margin and centres vertically by default", () => {
    const r = restingRect({ side: "left", y: 0.5 }, VW, VH);
    expect(r.left).toBe(M);
    // top edge sits at margin + 0.5 * (vh - 2*margin - size)
    expect(r.top).toBe(M + 0.5 * (VH - 2 * M - S));
  });

  it("pins to the right edge for a right-side position", () => {
    const r = restingRect({ side: "right", y: 0 }, VW, VH);
    expect(r.left).toBe(VW - M - S);
    expect(r.top).toBe(M);
  });

  it("places y=1 at the bottom margin", () => {
    const r = restingRect({ side: "left", y: 1 }, VW, VH);
    expect(r.top).toBe(VH - M - S);
  });
});

describe("clampRect", () => {
  it("keeps the button inside the margin-inset viewport", () => {
    expect(clampRect(-50, -50, VW, VH)).toEqual({ left: M, top: M });
    expect(clampRect(9999, 9999, VW, VH)).toEqual({
      left: VW - M - S,
      top: VH - M - S,
    });
  });
});

describe("rectToPosition", () => {
  it("snaps to the left when the button centre is left of midline", () => {
    const pos = rectToPosition(20, 100, VW, VH);
    expect(pos.side).toBe("left");
  });

  it("snaps to the right when the button centre is right of midline", () => {
    const pos = rectToPosition(VW - S - 20, 100, VW, VH);
    expect(pos.side).toBe("right");
  });

  it("round-trips a resting position through rect and back", () => {
    const original = { side: "right" as const, y: 0.3 };
    const r = restingRect(original, VW, VH);
    const back = rectToPosition(r.left, r.top, VW, VH);
    expect(back.side).toBe("right");
    expect(back.y).toBeCloseTo(0.3, 5);
  });

  it("falls back to mid-height when there is no vertical travel", () => {
    const pos = rectToPosition(0, 0, VW, S + 2 * M);
    expect(pos.y).toBe(0.5);
  });
});

// On iOS the software keyboard shrinks the visual viewport and can offset
// it within the layout viewport; the offsets shift the visible box the
// `position: fixed` button must stay inside.
describe("visual-viewport offsets", () => {
  const OFF_L = 5;
  const OFF_T = 60;

  it("restingRect shifts the resting spot by the viewport offset", () => {
    const r = restingRect({ side: "left", y: 0 }, VW, VH, S, M, OFF_L, OFF_T);
    expect(r.left).toBe(OFF_L + M);
    expect(r.top).toBe(OFF_T + M);
  });

  it("restingRect normalizes y into a keyboard-shrunk viewport", () => {
    // A bottom-pinned button (y=1) lands at the foot of the *reduced*
    // visible box, not behind the keyboard at the full-height bottom.
    const shrunkVh = 400;
    const r = restingRect({ side: "left", y: 1 }, VW, shrunkVh, S, M, 0, 0);
    expect(r.top).toBe(shrunkVh - M - S);
    expect(r.top).toBeLessThan(VH - M - S);
  });

  it("clampRect keeps the button inside the offset visible box", () => {
    expect(clampRect(-50, -50, VW, VH, S, M, OFF_L, OFF_T)).toEqual({
      left: OFF_L + M,
      top: OFF_T + M,
    });
    expect(clampRect(9999, 9999, VW, VH, S, M, OFF_L, OFF_T)).toEqual({
      left: OFF_L + VW - M - S,
      top: OFF_T + VH - M - S,
    });
  });

  it("round-trips through an offset viewport", () => {
    const original = { side: "right" as const, y: 0.3 };
    const r = restingRect(original, VW, VH, S, M, OFF_L, OFF_T);
    const back = rectToPosition(r.left, r.top, VW, VH, S, M, OFF_L, OFF_T);
    expect(back.side).toBe("right");
    expect(back.y).toBeCloseTo(0.3, 5);
  });
});
