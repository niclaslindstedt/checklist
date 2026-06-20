// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useSuppressEdgeSwipeBack } from "../../../src/ui/hooks/useSuppressEdgeSwipeBack.ts";

// jsdom has no real TouchEvent; fake the single `touches` field the hook
// reads onto a plain cancelable Event (mirrors the edge-swipe-open test) and
// hand the dispatched event back so the test can read `defaultPrevented`.
function dispatchTouch(type: string, point: { x: number; y: number } | null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: point === null ? [] : [{ clientX: point.x, clientY: point.y }],
  });
  document.dispatchEvent(event);
  return event;
}

// jsdom reports innerWidth 1024 by default; the right edge sits at ~1024.
afterEach(() => {
  document.body.innerHTML = "";
});

describe("useSuppressEdgeSwipeBack", () => {
  it("cancels a horizontal swipe that starts at the left edge", () => {
    renderHook(() => useSuppressEdgeSwipeBack(true));
    act(() => void dispatchTouch("touchstart", { x: 5, y: 300 }));
    let move!: Event;
    act(() => {
      move = dispatchTouch("touchmove", { x: 90, y: 305 });
    });
    expect(move.defaultPrevented).toBe(true);
  });

  it("cancels a horizontal swipe that starts at the right edge", () => {
    renderHook(() => useSuppressEdgeSwipeBack(true));
    act(
      () =>
        void dispatchTouch("touchstart", { x: window.innerWidth - 5, y: 300 }),
    );
    let move!: Event;
    act(() => {
      move = dispatchTouch("touchmove", { x: window.innerWidth - 90, y: 305 });
    });
    expect(move.defaultPrevented).toBe(true);
  });

  it("ignores a swipe that doesn't start at either edge", () => {
    renderHook(() => useSuppressEdgeSwipeBack(true));
    act(() => void dispatchTouch("touchstart", { x: 400, y: 300 }));
    let move!: Event;
    act(() => {
      move = dispatchTouch("touchmove", { x: 480, y: 305 });
    });
    expect(move.defaultPrevented).toBe(false);
  });

  it("leaves a mostly-vertical drag from the edge alone (it's a scroll)", () => {
    renderHook(() => useSuppressEdgeSwipeBack(true));
    act(() => void dispatchTouch("touchstart", { x: 5, y: 100 }));
    let move!: Event;
    act(() => {
      move = dispatchTouch("touchmove", { x: 20, y: 400 });
    });
    expect(move.defaultPrevented).toBe(false);
  });

  it("no-ops while disabled (a normal browser tab keeps its back-swipe)", () => {
    renderHook(() => useSuppressEdgeSwipeBack(false));
    act(() => void dispatchTouch("touchstart", { x: 5, y: 300 }));
    let move!: Event;
    act(() => {
      move = dispatchTouch("touchmove", { x: 90, y: 305 });
    });
    expect(move.defaultPrevented).toBe(false);
  });
});
