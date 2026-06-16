// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useEdgeSwipeOpen } from "../../../src/ui/hooks/useEdgeSwipeOpen.ts";

// jsdom has no real TouchEvent; fake the single `touches` field the hook
// reads onto a plain cancelable Event (mirrors the pull-to-refresh test).
function dispatchTouch(type: string, point: { x: number; y: number } | null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: point === null ? [] : [{ clientX: point.x, clientY: point.y }],
  });
  document.dispatchEvent(event);
}

// jsdom reports innerWidth 1024 by default; the right edge sits at ~1024.
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useEdgeSwipeOpen", () => {
  it("opens on an inward swipe from the left edge", () => {
    const onOpen = vi.fn();
    renderHook(() => useEdgeSwipeOpen({ side: "left", enabled: true, onOpen }));
    act(() => dispatchTouch("touchstart", { x: 5, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 80, y: 305 }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens on an inward swipe from the right edge", () => {
    const onOpen = vi.fn();
    renderHook(() =>
      useEdgeSwipeOpen({ side: "right", enabled: true, onOpen }),
    );
    act(() =>
      dispatchTouch("touchstart", { x: window.innerWidth - 5, y: 300 }),
    );
    act(() =>
      dispatchTouch("touchmove", { x: window.innerWidth - 90, y: 305 }),
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores a swipe that doesn't start at the watched edge", () => {
    const onOpen = vi.fn();
    renderHook(() => useEdgeSwipeOpen({ side: "left", enabled: true, onOpen }));
    act(() => dispatchTouch("touchstart", { x: 200, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 280, y: 305 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ignores a mostly-vertical drag (it's a scroll)", () => {
    const onOpen = vi.fn();
    renderHook(() => useEdgeSwipeOpen({ side: "left", enabled: true, onOpen }));
    act(() => dispatchTouch("touchstart", { x: 5, y: 100 }));
    act(() => dispatchTouch("touchmove", { x: 40, y: 400 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open for a short inward drag", () => {
    const onOpen = vi.fn();
    renderHook(() => useEdgeSwipeOpen({ side: "left", enabled: true, onOpen }));
    act(() => dispatchTouch("touchstart", { x: 5, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 30, y: 300 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("no-ops while disabled", () => {
    const onOpen = vi.fn();
    renderHook(() =>
      useEdgeSwipeOpen({ side: "left", enabled: false, onOpen }),
    );
    act(() => dispatchTouch("touchstart", { x: 5, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 80, y: 305 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("fires once per gesture, not on every move past the threshold", () => {
    const onOpen = vi.fn();
    renderHook(() => useEdgeSwipeOpen({ side: "left", enabled: true, onOpen }));
    act(() => dispatchTouch("touchstart", { x: 5, y: 300 }));
    act(() => dispatchTouch("touchmove", { x: 80, y: 305 }));
    act(() => dispatchTouch("touchmove", { x: 120, y: 305 }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
