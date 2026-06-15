// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePullToRefresh } from "../../../src/ui/hooks/usePullToRefresh.ts";

// Dispatch a synthetic touch at the document level. jsdom has no real
// TouchEvent, so we fake the single property the hook reads (`touches`)
// onto a plain cancelable Event. A `null` y models a zero-touch event
// (e.g. touchend, where `touches` is empty).
function dispatchTouch(type: string, y: number | null, target?: Element) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: y === null ? [] : [{ clientY: y }],
  });
  (target ?? document).dispatchEvent(event);
}

// Drive a full pull gesture from `start` to `end` (raw finger px) and
// release. The hook damps raw travel by 0.5, so reaching the 70px
// trigger needs ~140px of finger travel.
function pull(start: number, end: number) {
  act(() => dispatchTouch("touchstart", start));
  act(() => dispatchTouch("touchmove", end));
  act(() => dispatchTouch("touchend", null));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("usePullToRefresh", () => {
  it("fires onRefresh when the drag crosses the trigger distance", async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => usePullToRefresh(onRefresh));

    await act(async () => {
      pull(0, 200);
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    // Resolves back to idle once the refresh promise settles.
    expect(result.current.state).toBe("idle");
    expect(result.current.pullDistance).toBe(0);
  });

  it("reports the release state while armed mid-drag", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => usePullToRefresh(onRefresh));

    act(() => dispatchTouch("touchstart", 0));
    act(() => dispatchTouch("touchmove", 200));

    expect(result.current.state).toBe("release");
    expect(result.current.pullDistance).toBeGreaterThanOrEqual(70);
  });

  it("does not fire onRefresh for a short pull", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => usePullToRefresh(onRefresh));

    pull(0, 40);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("ignores upward drags", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    renderHook(() => usePullToRefresh(onRefresh));

    act(() => dispatchTouch("touchstart", 100));
    act(() => dispatchTouch("touchmove", 20));
    act(() => dispatchTouch("touchend", null));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("no-ops while disabled", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    renderHook(() => usePullToRefresh(onRefresh, { enabled: false }));

    pull(0, 200);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("is suppressed while a modal is open", () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);

    renderHook(() => usePullToRefresh(onRefresh));
    pull(0, 200);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
