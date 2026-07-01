// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSwipeCloseDrawer } from "../../../src/ui/hooks/useSwipeCloseDrawer.ts";

// jsdom has no real TouchEvent; fake the single `touches` field the hook
// reads onto a plain cancelable Event, and let the caller aim the event's
// `target` (used by the swipe-row guard). Mirrors the edge-swipe-open test.
function dispatchTouch(
  type: string,
  point: { x: number; y: number } | null,
  target: EventTarget = document,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: point === null ? [] : [{ clientX: point.x, clientY: point.y }],
  });
  target.dispatchEvent(event);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useSwipeCloseDrawer", () => {
  it("closes on an outward (leftward) swipe when docked left", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "left", enabled: true, onClose }),
    );
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 130, y: 305 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outward (rightward) swipe when docked right", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "right", enabled: true, onClose }),
    );
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 270, y: 305 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores an inward swipe (that's not a dismiss)", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "left", enabled: true, onClose }),
    );
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 280, y: 305 }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores a mostly-vertical drag (it's a list scroll)", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "left", enabled: true, onClose }),
    );
    act(() => dispatchTouch("touchstart", { x: 200, y: 100 }));
    act(() => dispatchTouch("touchmove", { x: 160, y: 400 }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close for a short outward drag", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "left", enabled: true, onClose }),
    );
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 180, y: 300 }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves a swipe that begins on a row's swipe-to-reveal surface alone", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "left", enabled: true, onClose }),
    );
    const row = document.createElement("div");
    row.setAttribute("data-swipe-row", "");
    document.body.appendChild(row);
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }, row));
    act(() => dispatchTouch("touchmove", { x: 130, y: 305 }, row));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("no-ops while disabled", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "left", enabled: false, onClose }),
    );
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 130, y: 305 }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("fires once per gesture, not on every move past the threshold", () => {
    const onClose = vi.fn();
    renderHook(() =>
      useSwipeCloseDrawer({ side: "left", enabled: true, onClose }),
    );
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 130, y: 305 }));
    act(() => dispatchTouch("touchmove", { x: 90, y: 305 }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
