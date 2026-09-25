// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/preact";

import { useDraggableMenuButton } from "../../../src/ui/hooks/useDraggableMenuButton.ts";
import {
  MENU_BUTTON_MARGIN,
  MENU_BUTTON_SIZE,
} from "../../../src/ui/sideMenuPosition.ts";

// jsdom does not evaluate `env()` (it drops the probe's padding outright), so
// stand in for an iPhone's insets by answering the computed padding — which
// only the inset probe reads here.
function fakeInsets(top: number, bottom: number) {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
    const style = real(el, pseudo);
    return {
      ...style,
      paddingTop: `${top}px`,
      paddingRight: "0px",
      paddingBottom: `${bottom}px`,
      paddingLeft: "0px",
    } as CSSStyleDeclaration;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // Drop the module's cached insets between cases.
  window.dispatchEvent(new Event("resize"));
});

describe("useDraggableMenuButton", () => {
  it("keeps the resting button clear of the status bar and home indicator", () => {
    fakeInsets(59, 34);
    const top = renderHook(() =>
      useDraggableMenuButton({ side: "left", y: 0 }, () => {}),
    );
    expect(top.result.current.style.top).toBe(`${59 + MENU_BUTTON_MARGIN}px`);

    const bottom = renderHook(() =>
      useDraggableMenuButton({ side: "left", y: 1 }, () => {}),
    );
    expect(bottom.result.current.style.top).toBe(
      `${window.innerHeight - 34 - MENU_BUTTON_MARGIN - MENU_BUTTON_SIZE}px`,
    );
  });
});
