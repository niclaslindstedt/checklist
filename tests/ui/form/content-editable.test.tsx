// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ContentEditable } from "../../../src/ui/form/ContentEditable.tsx";
import { focusAtEnd } from "../../../src/ui/form/caret.ts";

describe("ContentEditable", () => {
  it("renders a labelled, plain-text textbox seeded with the value", () => {
    render(
      <ContentEditable
        value="hello"
        onChange={() => {}}
        ariaLabel="Field"
        placeholder="Type…"
      />,
    );
    const box = screen.getByRole("textbox", { name: "Field" });
    expect(box.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(box.getAttribute("data-placeholder")).toBe("Type…");
    // The value is seeded into the DOM on mount.
    expect(box.textContent).toBe("hello");
  });

  it("reports edits through onChange from the live text content", () => {
    const onChange = vi.fn();
    render(<ContentEditable value="" onChange={onChange} ariaLabel="Field" />);
    const box = screen.getByRole("textbox", { name: "Field" });
    box.textContent = "typed";
    fireEvent.input(box);
    expect(onChange).toHaveBeenCalledWith("typed");
  });

  it("marks a multiline field with aria-multiline", () => {
    render(
      <ContentEditable
        value=""
        onChange={() => {}}
        ariaLabel="Note"
        multiline
      />,
    );
    expect(
      screen
        .getByRole("textbox", { name: "Note" })
        .getAttribute("aria-multiline"),
    ).toBe("true");
  });

  it("focusAtEnd focuses the element without throwing", () => {
    render(
      <ContentEditable value="abc" onChange={() => {}} ariaLabel="Field" />,
    );
    const box = screen.getByRole("textbox", { name: "Field" });
    focusAtEnd(box);
    expect(document.activeElement).toBe(box);
    // A null element is a no-op.
    expect(() => focusAtEnd(null)).not.toThrow();
  });
});
