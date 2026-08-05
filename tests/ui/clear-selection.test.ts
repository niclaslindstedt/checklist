// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { clearNativeSelection } from "../../src/ui/clear-selection.ts";

// Select the whole text of `el` the way the platform's press-and-hold does.
function selectAll(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function paragraph(text: string): HTMLElement {
  const el = document.createElement("p");
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("clearNativeSelection", () => {
  it("drops a highlight the page was carrying", () => {
    selectAll(paragraph("Buy milk"));
    expect(document.getSelection()!.isCollapsed).toBe(false);

    clearNativeSelection();

    expect(document.getSelection()!.rangeCount).toBe(0);
  });

  it("leaves a focused textarea's selection alone", () => {
    // Editing an item's body is the one place a selection does work — the
    // caret and its range belong to the user, not to a stray hold.
    const el = paragraph("Buy milk");
    selectAll(el);
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    clearNativeSelection();

    expect(document.getSelection()!.rangeCount).toBe(1);
  });

  it("leaves a focused input's selection alone", () => {
    selectAll(paragraph("Buy milk"));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    clearNativeSelection();

    expect(document.getSelection()!.rangeCount).toBe(1);
  });

  it("does nothing when there is no selection to clear", () => {
    expect(() => clearNativeSelection()).not.toThrow();
    expect(document.getSelection()!.rangeCount).toBe(0);
  });
});
