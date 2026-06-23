// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { focusAtEnd } from "../../../src/ui/form/caret.ts";

describe("focusAtEnd", () => {
  it("focuses with preventScroll so the browser doesn't jerk the page, caret at end", () => {
    const el = document.createElement("input");
    el.value = "hello";
    const focus = vi.spyOn(el, "focus");
    const setRange = vi.spyOn(el, "setSelectionRange");

    focusAtEnd(el);

    // preventScroll keeps the browser from scrolling the whole page (and the
    // pinned header) to a field near a clipped edge — the editor reveals the
    // row by scrolling only the list container instead.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(setRange).toHaveBeenCalledWith(5, 5);
  });

  it("is a no-op for a null element", () => {
    expect(() => focusAtEnd(null)).not.toThrow();
  });
});
