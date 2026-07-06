// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSwipeUpReveal } from "../../../src/ui/hooks/useSwipeUpReveal.ts";

// Dispatch a synthetic touch on `el`. jsdom has no real TouchEvent, so we
// fake the single property the hook reads (`touches`) onto a plain
// cancelable Event. A `null` y models a zero-touch event (touchend).
function dispatchTouch(el: Element, type: string, y: number | null) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: y === null ? [] : [{ clientY: y }],
  });
  el.dispatchEvent(event);
}

// jsdom computes no layout, so scrollHeight/scrollTop/clientHeight are all 0
// and `atScrollBottom` is satisfied by default — the container reads as
// scrolled to its bottom, which is what the gesture needs.
function makeContainer() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

// Swipe the finger up from `start` to `end` (raw px) and release. Travel is
// damped by 0.5, so crossing the 64px trigger needs ~128px of finger travel.
function swipeUp(el: Element, start: number, end: number) {
  act(() => dispatchTouch(el, "touchstart", start));
  act(() => dispatchTouch(el, "touchmove", end));
  act(() => dispatchTouch(el, "touchend", null));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useSwipeUpReveal", () => {
  it("fires onReveal when an upward drag crosses the trigger distance", () => {
    const el = makeContainer();
    const onReveal = vi.fn();
    renderHook(() =>
      useSwipeUpReveal({ current: el }, { enabled: true, onReveal }),
    );

    swipeUp(el, 200, 0);

    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("reports the release state while armed mid-drag", () => {
    const el = makeContainer();
    const { result } = renderHook(() =>
      useSwipeUpReveal({ current: el }, { enabled: true, onReveal: vi.fn() }),
    );

    act(() => dispatchTouch(el, "touchstart", 200));
    act(() => dispatchTouch(el, "touchmove", 0));

    expect(result.current.state).toBe("release");
    expect(result.current.pullDistance).toBeGreaterThanOrEqual(64);
  });

  it("does not fire for a short upward drag", () => {
    const el = makeContainer();
    const onReveal = vi.fn();
    const { result } = renderHook(() =>
      useSwipeUpReveal({ current: el }, { enabled: true, onReveal }),
    );

    swipeUp(el, 200, 180);

    expect(onReveal).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("ignores downward drags", () => {
    const el = makeContainer();
    const onReveal = vi.fn();
    renderHook(() =>
      useSwipeUpReveal({ current: el }, { enabled: true, onReveal }),
    );

    act(() => dispatchTouch(el, "touchstart", 100));
    act(() => dispatchTouch(el, "touchmove", 260));
    act(() => dispatchTouch(el, "touchend", null));

    expect(onReveal).not.toHaveBeenCalled();
  });

  it("no-ops while disabled", () => {
    const el = makeContainer();
    const onReveal = vi.fn();
    renderHook(() =>
      useSwipeUpReveal({ current: el }, { enabled: false, onReveal }),
    );

    swipeUp(el, 200, 0);

    expect(onReveal).not.toHaveBeenCalled();
  });

  it("is suppressed while a modal is open", () => {
    const el = makeContainer();
    const onReveal = vi.fn();
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    renderHook(() =>
      useSwipeUpReveal({ current: el }, { enabled: true, onReveal }),
    );
    swipeUp(el, 200, 0);

    expect(onReveal).not.toHaveBeenCalled();
  });

  it("ignores a drag that starts on a form field", () => {
    const el = makeContainer();
    const input = document.createElement("input");
    el.appendChild(input);
    const onReveal = vi.fn();
    renderHook(() =>
      useSwipeUpReveal({ current: el }, { enabled: true, onReveal }),
    );

    // The touch originates on the input (bubbling up to the container's
    // listener with the input as target), so the gesture stands down.
    act(() => dispatchTouch(input, "touchstart", 200));
    act(() => dispatchTouch(el, "touchmove", 0));
    act(() => dispatchTouch(el, "touchend", null));

    expect(onReveal).not.toHaveBeenCalled();
  });
});
