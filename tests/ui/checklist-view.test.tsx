// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import type { ChecklistContextValue } from "../../src/ui/checklist-context.ts";
import type { Checklist, ChecklistItem } from "../../src/domain/types.ts";
import { renderWithChecklist } from "./context-harness.tsx";

const NOW = "2026-01-01T00:00:00.000Z";

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

  describe("bulk actions (long-press the add button)", () => {
    it("keeps the bulk actions out of reach until a long-press", () => {
      renderView({ checkedCount: 1 });
      expect(
        screen.queryByRole("button", { name: "Archive finished" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Delete finished" }),
      ).toBeNull();
    });

    it("fans out and archives finished items on long-press", () => {
      vi.useFakeTimers();
      try {
        const archiveFinished = vi.fn();
        renderView({ checkedCount: 1, archiveFinished });
        fireEvent.pointerDown(screen.getByRole("button", { name: "Add item" }));
        act(() => {
          vi.advanceTimersByTime(450);
        });
        fireEvent.click(
          screen.getByRole("button", { name: "Archive finished" }),
        );
        expect(archiveFinished).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("requires a confirming second tap before deleting finished items", () => {
      vi.useFakeTimers();
      try {
        const deleteFinished = vi.fn();
        renderView({ checkedCount: 1, deleteFinished });
        fireEvent.pointerDown(screen.getByRole("button", { name: "Add item" }));
        act(() => {
          vi.advanceTimersByTime(450);
        });
        // First tap only arms the confirm state — nothing is deleted yet.
        fireEvent.click(
          screen.getByRole("button", { name: "Delete finished" }),
        );
        expect(deleteFinished).not.toHaveBeenCalled();
        // The button now reads the confirm label; tapping it commits.
        fireEvent.click(screen.getByRole("button", { name: "Tap to confirm" }));
        expect(deleteFinished).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    // On a touchscreen the gesture ends in `pointerup`, not a `click` — the
    // add button only morphs into the bulk row mid-gesture, and iOS doesn't
    // reliably synthesise a `click` on an element that appears that late.
    // Archiving must fire from the pointerup alone.
    it("archives finished items from a pointerup on the bulk button", () => {
      vi.useFakeTimers();
      try {
        const archiveFinished = vi.fn();
        renderView({ checkedCount: 1, archiveFinished });
        fireEvent.pointerDown(screen.getByRole("button", { name: "Add item" }));
        act(() => {
          vi.advanceTimersByTime(450);
        });
        fireEvent.pointerUp(
          screen.getByRole("button", { name: "Archive finished" }),
        );
        expect(archiveFinished).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    // A real tap fires pointerup *and* a trailing synthetic click on the same
    // button. The delete button stays put (arming, not collapsing), so a tap
    // that counted twice would arm *and* commit in one go — the trailing
    // click must be swallowed, leaving the destroy gated behind a real second
    // tap.
    it("requires a real second tap to confirm delete across pointerup+click", () => {
      vi.useFakeTimers();
      try {
        const deleteFinished = vi.fn();
        renderView({ checkedCount: 1, deleteFinished });
        fireEvent.pointerDown(screen.getByRole("button", { name: "Add item" }));
        act(() => {
          vi.advanceTimersByTime(450);
        });
        // One physical tap = pointerup + trailing click; this only arms.
        const del = screen.getByRole("button", { name: "Delete finished" });
        fireEvent.pointerUp(del);
        fireEvent.click(del);
        expect(deleteFinished).not.toHaveBeenCalled();
        // A genuine second tap commits.
        fireEvent.pointerUp(screen.getByRole("button", { name: "Tap to confirm" }));
        expect(deleteFinished).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("copy to clipboard", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("copies the active checklist as frontmatter-free markdown", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });
      const activeList: Checklist = {
        version: 1,
        id: "list-0",
        templateId: "",
        name: "Groceries",
        items: [
          { id: "a", title: "Milk", checked: false },
          { id: "b", title: "Bread", checked: true },
        ],
        createdAt: NOW,
        updatedAt: NOW,
      };
      renderView({ activeList });
      fireEvent.click(
        screen.getByRole("button", { name: "Copy checklist as markdown" }),
      );
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      const md = writeText.mock.calls[0]![0] as string;
      expect(md).toContain("# Groceries");
      expect(md).toContain("- [ ] Milk");
      expect(md).toContain("- [x] Bread");
      expect(md).not.toContain("---");
    });
  });

  describe("import by paste", () => {
    function openComposer(importItems: (md: string) => number) {
      renderView({ items: [], importItems });
      fireEvent.click(screen.getByRole("button", { name: "Add item" }));
      return screen.getByLabelText("Add item");
    }

    it("routes a pasted markdown checklist to the importer", () => {
      const importItems = vi.fn().mockReturnValue(2);
      const input = openComposer(importItems);
      fireEvent.paste(input, {
        clipboardData: { getData: () => "- [ ] Milk\n- [x] Bread" },
      });
      expect(importItems).toHaveBeenCalledWith("- [ ] Milk\n- [x] Bread");
    });

    it("lets ordinary text paste through (importer returns zero)", () => {
      const importItems = vi.fn().mockReturnValue(0);
      const input = openComposer(importItems);
      fireEvent.paste(input, {
        clipboardData: { getData: () => "just one line" },
      });
      expect(importItems).toHaveBeenCalledWith("just one line");
      // The field still holds whatever the default paste would insert — the
      // composer didn't swallow it as an import.
    });
  });
});
