// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

import { ChecklistTitle } from "../../src/ui/ChecklistTitle.tsx";
import { fireDomEvent } from "./fire-dom-event.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTitle(
  props: Partial<React.ComponentProps<typeof ChecklistTitle>> = {},
) {
  const onRename = vi.fn();
  render(<ChecklistTitle name="Groceries" onRename={onRename} {...props} />);
  return { onRename };
}

const field = () =>
  screen.getByLabelText("Rename checklist") as HTMLInputElement;

describe("ChecklistTitle", () => {
  it("shows the name as the rename affordance", () => {
    renderTitle();
    expect(screen.getByRole("button", { name: "Groceries" })).toBeTruthy();
    expect(screen.queryByLabelText("Rename checklist")).toBeNull();
  });

  it("opens the field with the whole name selected", () => {
    renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    const input = field();
    expect(input.value).toBe("Groceries");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Groceries".length);
  });

  // The mobile keyboard hangs on this: iOS raises it only for a focus() that
  // runs while the press is still being handled. Deferring the focus to a
  // passive effect (a commit later, after the paint) left the field open with
  // the keyboard down — so assert the focus has already landed by the time
  // the press finishes bubbling, not merely once the test has settled.
  it("focuses the field inside the press that opened it", () => {
    renderTitle();
    let focusedDuringPress: Element | null = null;
    const probe = () => {
      focusedDuringPress = document.activeElement;
    };
    document.addEventListener("click", probe);
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    document.removeEventListener("click", probe);
    expect(focusedDuringPress).toBe(field());
  });

  it("opens focused on mount when the list still needs a name", () => {
    renderTitle({ autoEdit: true });
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole("button", { name: "Groceries" })).toBeNull();
  });

  it("commits a new name on Enter", () => {
    const { onRename } = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    fireEvent.change(field(), { target: { value: "  Packing  " } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("Packing");
    // The name itself is the parent's to update; the field closes either way.
    expect(screen.queryByLabelText("Rename checklist")).toBeNull();
  });

  it("keeps the old name on Escape", () => {
    const { onRename } = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    fireEvent.change(field(), { target: { value: "Packing" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Groceries" })).toBeTruthy();
  });

  // On iOS a press on something non-focusable never blurs the field, so an
  // empty list — no row to take the focus — left the name focused and the
  // keyboard up however often the user pressed the list.
  it("commits and closes on a press outside the field", () => {
    const { onRename } = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    fireEvent.change(field(), { target: { value: "Packing" } });
    fireEvent.pointerDown(document.body);
    expect(onRename).toHaveBeenCalledWith("Packing");
    expect(screen.queryByLabelText("Rename checklist")).toBeNull();
  });

  it("stays open while the press lands on the field itself", () => {
    renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    fireEvent.pointerDown(field());
    expect(screen.getByLabelText("Rename checklist")).toBeTruthy();
  });

  // Preact routes `onBlur` through `focusout`, which jsdom exposes no
  // `onfocusout` property for — so dispatch the real event.
  it("commits when focus leaves the field", () => {
    const { onRename } = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    fireEvent.change(field(), { target: { value: "Packing" } });
    fireDomEvent(field(), "focusout");
    expect(onRename).toHaveBeenCalledWith("Packing");
  });

  it("ignores an emptied name", () => {
    const { onRename } = renderTitle();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Groceries" })).toBeTruthy();
  });
});
