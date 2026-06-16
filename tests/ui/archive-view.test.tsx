// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { ArchiveView } from "../../src/ui/ArchiveView.tsx";
import type { ChecklistContextValue } from "../../src/ui/checklist-context.ts";
import type { ChecklistItem } from "../../src/domain/types.ts";
import { renderWithChecklist } from "./context-harness.tsx";

const items: ChecklistItem[] = [
  { id: "i1", title: "Old milk", checked: true, archived: true },
  { id: "i2", title: "Stale bread", checked: false, archived: true },
];

// ArchiveView reads the archived items and their actions from the checklist
// context, so each test seeds the context and overrides what it asserts on.
function renderView(value: Partial<ChecklistContextValue> = {}) {
  return renderWithChecklist(<ArchiveView />, { archivedItems: items, ...value });
}

describe("ArchiveView", () => {
  it("lists archived items with the count", () => {
    renderView();
    expect(screen.getByText("Old milk")).toBeTruthy();
    expect(screen.getByText("Stale bread")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows an empty state when nothing is archived", () => {
    renderView({ archivedItems: [] });
    expect(screen.getByText(/nothing archived/i)).toBeTruthy();
  });

  it("restores an item through its restore button", () => {
    const unarchive = vi.fn();
    renderView({ unarchive });
    fireEvent.click(screen.getAllByLabelText("Restore item")[0]!);
    expect(unarchive).toHaveBeenCalledWith("i1");
  });

  it("deletes an item through its delete button", () => {
    const remove = vi.fn();
    renderView({ remove });
    fireEvent.click(screen.getAllByLabelText("Delete")[0]!);
    expect(remove).toHaveBeenCalledWith("i1");
  });
});
