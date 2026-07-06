// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ArchivedDrawer } from "../../src/ui/ArchivedDrawer.tsx";
import type { ChecklistItem } from "../../src/domain/types.ts";
import { ToastProvider } from "../../src/ui/toast/Toast.tsx";

const items: ChecklistItem[] = [
  { id: "i1", title: "Old milk", checked: true, archived: true },
  { id: "i2", title: "Stale bread", checked: false, archived: true },
];

function renderDrawer(
  props: Partial<React.ComponentProps<typeof ArchivedDrawer>> = {},
) {
  const merged = {
    open: true,
    onClose: () => {},
    listName: "Groceries",
    items,
    onRestore: () => {},
    onDelete: () => {},
    ...props,
  };
  return render(
    <ToastProvider>
      <ArchivedDrawer {...merged} />
    </ToastProvider>,
  );
}

describe("ArchivedDrawer", () => {
  it("renders nothing while closed", () => {
    renderDrawer({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists the archived items with the count and list name", () => {
    renderDrawer();
    expect(screen.getByText("Old milk")).toBeTruthy();
    expect(screen.getByText("Stale bread")).toBeTruthy();
    // Header names the list and shows the archived count.
    expect(screen.getByText(/Archived in Groceries/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows an empty state when the list has nothing archived", () => {
    renderDrawer({ items: [] });
    expect(screen.getByText(/Nothing archived in this list/i)).toBeTruthy();
  });

  it("restores an item through its restore button", () => {
    const onRestore = vi.fn();
    renderDrawer({ onRestore });
    fireEvent.click(screen.getAllByLabelText("Restore item")[0]!);
    expect(onRestore).toHaveBeenCalledWith("i1");
  });

  it("deletes an item through its delete button", () => {
    const onDelete = vi.fn();
    renderDrawer({ onDelete });
    fireEvent.click(screen.getAllByLabelText("Delete")[0]!);
    expect(onDelete).toHaveBeenCalledWith("i1");
  });

  it("closes via the header X button after the slide-out transition", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    // The X (the last of the Close-labelled controls; the backdrop is the
    // other) requests a close; the sheet then slides out and calls onClose
    // when its transform transition ends.
    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.transitionEnd(screen.getByRole("dialog"), {
      propertyName: "transform",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses on a downward swipe of the header", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    const dialog = screen.getByRole("dialog");
    const header = dialog.querySelector("header")!;
    fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(header, { touches: [{ clientY: 200 }] });
    fireEvent.touchEnd(header);
    fireEvent.transitionEnd(dialog, { propertyName: "transform" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("snaps back (no close) when the header swipe is too short", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });
    const dialog = screen.getByRole("dialog");
    const header = dialog.querySelector("header")!;
    fireEvent.touchStart(header, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(header, { touches: [{ clientY: 120 }] });
    fireEvent.touchEnd(header);
    expect(onClose).not.toHaveBeenCalled();
  });
});
