// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { ArchiveView } from "../../src/ui/ArchiveView.tsx";
import type { ChecklistContextValue } from "../../src/ui/checklist-context.ts";
import type { ArchivedGroup } from "../../src/domain/checklists.ts";
import { renderWithChecklist } from "./context-harness.tsx";

const groups: ArchivedGroup[] = [
  {
    id: "list-1",
    name: "Groceries",
    items: [{ id: "i1", title: "Old milk", checked: true, archived: true }],
  },
  {
    id: "list-2",
    name: "Chores",
    items: [{ id: "i2", title: "Stale bread", checked: false, archived: true }],
  },
];

// ArchiveView reads the grouped archived items and their actions from the
// checklist context, so each test seeds the context and overrides what it
// asserts on.
function renderView(value: Partial<ChecklistContextValue> = {}) {
  return renderWithChecklist(<ArchiveView />, {
    archivedGroups: groups,
    ...value,
  });
}

describe("ArchiveView", () => {
  it("lists archived items with the total count", () => {
    renderView();
    expect(screen.getByText("Old milk")).toBeTruthy();
    expect(screen.getByText("Stale bread")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("groups archived items under a header for each source checklist", () => {
    renderView();
    expect(screen.getByRole("button", { name: /Groceries/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Chores/ })).toBeTruthy();
  });

  it("collapses and re-expands a group when its header is clicked", () => {
    renderView();
    const header = screen.getByRole("button", { name: /Groceries/ });
    // Collapsing hides only that group's items; siblings stay put.
    fireEvent.click(header);
    expect(screen.queryByText("Old milk")).toBeNull();
    expect(screen.getByText("Stale bread")).toBeTruthy();
    expect(header.getAttribute("aria-expanded")).toBe("false");
    // Clicking again brings them back.
    fireEvent.click(header);
    expect(screen.getByText("Old milk")).toBeTruthy();
    expect(header.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows an empty state when nothing is archived", () => {
    renderView({ archivedGroups: [] });
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

  it("hides the empty-archive button when nothing is archived", () => {
    renderView({ archivedGroups: [] });
    expect(screen.queryByLabelText("Empty archive")).toBeNull();
  });

  it("empties the archive after confirming", async () => {
    const emptyArchive = vi.fn();
    renderView({ emptyArchive });
    // The header button only opens the confirm; it must not empty on its own.
    fireEvent.click(screen.getByLabelText("Empty archive"));
    expect(emptyArchive).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Empty archive" }),
    );
    await waitFor(() => expect(emptyArchive).toHaveBeenCalledTimes(1));
  });
});
