// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import type { ChecklistContextValue } from "../../src/ui/checklist-context.ts";
import type { ChecklistItem } from "../../src/domain/types.ts";
import { renderWithChecklist } from "./context-harness.tsx";

const items: ChecklistItem[] = [
  { id: "i1", title: "Buy milk", checked: false },
];

// ChecklistView reads its data from the checklist context, so each test
// seeds the context and overrides only the fields it asserts on.
function renderView(value: Partial<ChecklistContextValue> = {}) {
  return renderWithChecklist(<ChecklistView />, { items, ...value });
}

describe("ChecklistView", () => {
  it("renders items and the progress count", () => {
    renderView();
    expect(screen.getByText("Buy milk")).toBeTruthy();
    expect(screen.getByText("0/1")).toBeTruthy();
  });

  it("shows an empty state when there are no items", () => {
    renderView({ items: [] });
    expect(screen.getByText(/nothing here yet/i)).toBeTruthy();
  });

  it("opens the composer from the add button and adds an item on submit", () => {
    const addItem = vi.fn();
    renderView({ items: [], addItem });
    // The composer is closed until the add button is tapped.
    expect(screen.queryByPlaceholderText("Add item…")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "New thing" } });
    fireEvent.submit(input.closest("form")!);
    expect(addItem).toHaveBeenCalledWith("New thing");
  });

  it("commits the typed text when the composer loses focus", () => {
    const addItem = vi.fn();
    renderView({ items: [], addItem });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "On blur" } });
    fireEvent.blur(input);
    expect(addItem).toHaveBeenCalledWith("On blur");
  });

  it("discards an empty draft on blur without adding anything", () => {
    const addItem = vi.fn();
    renderView({ items: [], addItem });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    fireEvent.blur(screen.getByLabelText("Add item"));
    expect(addItem).not.toHaveBeenCalled();
    // Composer is gone again and the empty state is back.
    expect(screen.getByText(/nothing here yet/i)).toBeTruthy();
  });

  it("toggles an item through its checkbox", () => {
    const toggle = vi.fn();
    renderView({ toggle });
    fireEvent.click(screen.getByLabelText("Check item"));
    expect(toggle).toHaveBeenCalledWith("i1");
  });

  it("renders a drag handle for reordering each item", () => {
    renderView();
    expect(screen.getByLabelText("Drag to reorder")).toBeTruthy();
  });

  it("shows the active checklist's name as the header title", () => {
    renderView({
      checklists: [{ id: "list-0", name: "Groceries", remaining: 0 }],
      activeChecklistId: "list-0",
    });
    expect(screen.getByRole("button", { name: "Groceries" })).toBeTruthy();
  });

  it("renames the active checklist from the clickable header title", () => {
    const renameChecklist = vi.fn();
    renderView({
      checklists: [{ id: "list-0", name: "Groceries", remaining: 0 }],
      activeChecklistId: "list-0",
      renameChecklist,
    });
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    const input = screen.getByLabelText("Rename checklist");
    fireEvent.change(input, { target: { value: "Packing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(renameChecklist).toHaveBeenCalledWith("list-0", "Packing");
  });
});
