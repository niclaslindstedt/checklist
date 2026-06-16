// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import type { ChecklistItem } from "../../src/domain/types.ts";

const items: ChecklistItem[] = [
  { id: "i1", title: "Buy milk", checked: false },
];

function noop(): void {}

// Defaults for every required ChecklistView prop so each test overrides
// only the handlers it asserts on.
function renderView(
  props: Partial<React.ComponentProps<typeof ChecklistView>>,
) {
  return render(
    <ChecklistView
      items={items}
      checkedCount={0}
      onAdd={noop}
      onToggle={noop}
      onRemove={noop}
      onArchive={noop}
      onReorder={noop}
      sync={null}
      {...props}
    />,
  );
}

describe("ChecklistView", () => {
  it("renders items and the progress count", () => {
    renderView({});
    expect(screen.getByText("Buy milk")).toBeTruthy();
    expect(screen.getByText("0/1")).toBeTruthy();
  });

  it("shows an empty state when there are no items", () => {
    renderView({ items: [] });
    expect(screen.getByText(/nothing here yet/i)).toBeTruthy();
  });

  it("adds an item when the composer is submitted", () => {
    const onAdd = vi.fn();
    renderView({ items: [], onAdd });
    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "New thing" } });
    fireEvent.submit(input.closest("form")!);
    expect(onAdd).toHaveBeenCalledWith("New thing");
  });

  it("toggles an item through its checkbox", () => {
    const onToggle = vi.fn();
    renderView({ onToggle });
    fireEvent.click(screen.getByLabelText("Check item"));
    expect(onToggle).toHaveBeenCalledWith("i1");
  });

  it("renders a drag handle for reordering each item", () => {
    renderView({});
    expect(screen.getByLabelText("Drag to reorder")).toBeTruthy();
  });
});
