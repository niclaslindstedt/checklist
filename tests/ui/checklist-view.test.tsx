// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import type { ChecklistContextValue } from "../../src/ui/checklist-context.ts";
import type { Checklist, ChecklistItem } from "../../src/domain/types.ts";
import { renderWithChecklist } from "./context-harness.tsx";

const NOW = "2026-01-01T00:00:00.000Z";

// Type into the editor's native input/textarea, and find the open editor by its
// textbox role (the view-mode title is a button with the same label).
function setText(el: HTMLElement, text: string): void {
  fireEvent.change(el, { target: { value: text } });
}
const titleEditor = () =>
  screen.getByRole("textbox", { name: "Edit item" }) as HTMLInputElement;

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
    expect(screen.getByLabelText("0 of 1 items checked")).toBeTruthy();
  });

  it("hides the progress count when showItemCount is off", () => {
    renderView({ showItemCount: false });
    expect(screen.queryByLabelText(/items checked/i)).toBeNull();
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

  it("renders a dimmed checkbox placeholder in the composer so the input aligns with item titles", () => {
    renderView({ items: [] });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const form = screen.getByLabelText("Add item").closest("form")!;
    // The composer mirrors a row's leading columns: the "+" caret slot plus a
    // dimmed, inert checkbox box (rounded border, no native input) standing in
    // for where the new item's checkbox will land.
    const placeholder = form.querySelector(".rounded-sm");
    expect(placeholder).not.toBeNull();
    expect(placeholder!.className).toContain("opacity-40");
    // It's purely decorative — no focusable/announced checkbox in the composer.
    expect(form.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("adds the item and opens its body editor on Shift+Enter in the composer", () => {
    // addItem returns the new row's id; the view hands that to the row so it
    // opens straight into its body editor. Seed the item so that row exists.
    const addItem = vi.fn().mockReturnValue("i1");
    renderView({ items, addItem });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "Buy milk" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    // The item is added exactly once (the closing composer's blur must not
    // re-add it), and the new row's note field is open and ready.
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith("Buy milk");
    expect(screen.getByLabelText(/markdown supported/i)).toBeTruthy();
  });

  it("falls back to a plain add on Shift+Enter when notes are disabled", () => {
    const addItem = vi.fn().mockReturnValue("i1");
    renderView({ items: [], addItem, disableItemNotes: true });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "New thing" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    // No body to edit — Shift+Enter behaves like Enter, keeping the composer
    // open for the next item rather than opening a note field.
    expect(addItem).toHaveBeenCalledWith("New thing");
    expect(screen.queryByLabelText(/markdown supported/i)).toBeNull();
    expect(screen.getByLabelText("Add item")).toBeTruthy();
  });

  it("defers Enter to accept a pending autocorrect suggestion before adding", () => {
    // On a soft keyboard the autocorrect suggestion is still composing when
    // Enter arrives, so the field holds the raw, un-corrected text. The add
    // must wait for the composition to commit so the corrected word lands —
    // exactly as tapping Space would have accepted it.
    const addItem = vi.fn();
    renderView({ items: [], addItem });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const input = screen.getByLabelText("Add item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "teh" } });
    // Enter while the IME is composing: nothing is added yet.
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(addItem).not.toHaveBeenCalled();
    // The suggestion is applied and the composition ends — now the corrected
    // text is what gets added.
    fireEvent.compositionEnd(input, { target: { value: "the" } });
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith("the");
  });

  it("adds immediately on a plain Enter with no pending composition", () => {
    // The deferral is gated on an active composition; a normal hardware-key
    // Enter still commits the typed text on the spot.
    const addItem = vi.fn();
    renderView({ items: [], addItem });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "New thing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith("New thing");
  });

  it("opens a composer below the edited row on Enter and adds after it", () => {
    const editItem = vi.fn();
    const addItemAfter = vi.fn().mockReturnValue("i2");
    renderView({ editItem, addItemAfter });
    // Edit the existing item, then press Enter in the title.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const titleInput = titleEditor();
    setText(titleInput, "Buy oat milk");
    fireEvent.keyDown(titleInput, { key: "Enter" });
    expect(editItem).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
    // The add-item draft is now open below the edited row; an item typed into
    // it lands right after "i1" rather than at the top or bottom of the list.
    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "Buy bread" } });
    fireEvent.submit(input.closest("form")!);
    expect(addItemAfter).toHaveBeenCalledWith("Buy bread", "i1");
  });

  it("chains successive adds below the row, in order", () => {
    // Each add returns the new item's id, which becomes the next anchor, so a
    // run of entries inserts after one another rather than stacking reversed.
    // The added rows are seeded so the composer (which follows the anchor) has
    // a live row to sit below after each add, mirroring the real document.
    const ids = ["a", "b"];
    const addItemAfter = vi.fn().mockImplementation(() => ids.shift() ?? null);
    const items: ChecklistItem[] = [
      { id: "i1", title: "First", checked: false },
      { id: "a", title: "A", checked: false },
      { id: "b", title: "B", checked: false },
    ];
    renderView({ items, addItemAfter });

    fireEvent.click(screen.getByText("First"));
    const titleInput = titleEditor();
    setText(titleInput, "First");
    fireEvent.keyDown(titleInput, { key: "Enter" });

    const input = screen.getByLabelText("Add item");
    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "B" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(addItemAfter.mock.calls).toEqual([
      ["A", "i1"],
      ["B", "a"],
    ]);
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

  describe("erasing items with Backspace", () => {
    const twoItems: ChecklistItem[] = [
      { id: "i1", title: "Milk", checked: false },
      { id: "i2", title: "Bread", checked: false },
    ];

    it("removes an emptied line and backs editing up to the line above", () => {
      const removeEmpty = vi.fn();
      renderView({ items: twoItems, removeEmpty });

      // Edit the second item, erase it, then Backspace past the start.
      fireEvent.click(screen.getByText("Bread"));
      const input = titleEditor();
      setText(input, "");
      fireEvent.keyDown(input, { key: "Backspace" });

      // The emptied line is removed, and the line above opens for editing
      // (its title is now an editor showing "Milk"). `removeEmpty` is mocked
      // here so the emptied row stays mounted, so match by content rather than
      // assuming a single open editor.
      expect(removeEmpty).toHaveBeenCalledWith("i2");
      expect(
        screen
          .getAllByRole("textbox", { name: "Edit item" })
          .map((el) => (el as HTMLInputElement).value),
      ).toContain("Milk");
    });

    it("does not back up past the top line on Backspace", () => {
      const removeEmpty = vi.fn();
      renderView({ items: twoItems, removeEmpty });

      fireEvent.click(screen.getByText("Milk"));
      const input = titleEditor();
      setText(input, "");
      fireEvent.keyDown(input, { key: "Backspace" });

      // Top of the list: nothing above to back into, so the keystroke is left
      // alone (the empty line is only cleaned up on blur).
      expect(removeEmpty).not.toHaveBeenCalled();
    });

    it("removes an item emptied out and then blurred", () => {
      const removeEmpty = vi.fn();
      renderView({ items: twoItems, removeEmpty });

      fireEvent.click(screen.getByText("Bread"));
      const input = titleEditor();
      setText(input, "");
      fireEvent.blur(input);

      expect(removeEmpty).toHaveBeenCalledWith("i2");
    });

    it("dismisses an empty composer and backs editing up into the line above", () => {
      const addItemAfter = vi.fn().mockReturnValue("i3");
      renderView({ items: twoItems, addItemAfter });

      // Open the after-an-item composer below "Milk" (i1) by pressing Enter
      // while editing it.
      fireEvent.click(screen.getByText("Milk"));
      fireEvent.keyDown(titleEditor(), { key: "Enter" });
      const composer = screen.getByLabelText("Add item");

      // Backspace in the still-empty composer dismisses the draft and opens the
      // line above ("Milk") for editing — nothing is added.
      fireEvent.keyDown(composer, { key: "Backspace" });

      expect(addItemAfter).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Add item")).toBeNull();
      expect(titleEditor().value).toBe("Milk");
    });

    it("ignores Backspace in a composer that has text typed into it", () => {
      renderView({ items: twoItems });

      fireEvent.click(screen.getByText("Milk"));
      fireEvent.keyDown(titleEditor(), { key: "Enter" });
      const composer = screen.getByLabelText("Add item") as HTMLInputElement;
      setText(composer, "x");

      // A non-empty composer keeps Backspace as ordinary text editing — the
      // draft stays open rather than backing up into the line above.
      fireEvent.keyDown(composer, { key: "Backspace" });
      expect(screen.getByLabelText("Add item")).toBeTruthy();
    });

    it("leaves a top-of-list composer alone on Backspace (nothing above)", () => {
      renderView({ items: twoItems, addItemPosition: "top" });

      fireEvent.click(screen.getByRole("button", { name: "Add item" }));
      const composer = screen.getByLabelText("Add item");
      fireEvent.keyDown(composer, { key: "Backspace" });

      // The composer sits above the whole list, so there's nothing to back up
      // into — it stays open.
      expect(screen.getByLabelText("Add item")).toBeTruthy();
    });
  });

  describe("add button while editing", () => {
    const twoItems: ChecklistItem[] = [
      { id: "i1", title: "Milk", checked: false },
      { id: "i2", title: "Bread", checked: false },
    ];

    it("hides the add button while a row is being edited", () => {
      renderView({ items: twoItems });

      // Visible at rest.
      expect(screen.getByRole("button", { name: "Add item" })).toBeTruthy();

      // Editing a row hides it so it doesn't crowd the keyboard.
      fireEvent.click(screen.getByText("Bread"));
      expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();

      // Closing the editor (Escape) brings it back.
      fireEvent.keyDown(titleEditor(), { key: "Escape" });
      expect(screen.getByRole("button", { name: "Add item" })).toBeTruthy();
    });

    it("does not render an app-drawn keyboard nav bar", () => {
      // The editor relies on the platform's native keyboard bar instead.
      renderView({ items: twoItems });
      fireEvent.click(screen.getByText("Bread"));

      expect(
        screen.queryByRole("button", { name: "Edit next item" }),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "Done editing" })).toBeNull();
    });
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

    it("deletes finished items on the first tap (undo covers the mistake)", () => {
      vi.useFakeTimers();
      try {
        const deleteFinished = vi.fn();
        renderView({ checkedCount: 1, deleteFinished });
        fireEvent.pointerDown(screen.getByRole("button", { name: "Add item" }));
        act(() => {
          vi.advanceTimersByTime(450);
        });
        // A single tap deletes straight away — no confirm step.
        fireEvent.click(
          screen.getByRole("button", { name: "Delete finished" }),
        );
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
    // button. Only the pointerup should count — the trailing click is
    // swallowed so one physical tap deletes exactly once.
    it("deletes exactly once across a pointerup+click tap", () => {
      vi.useFakeTimers();
      try {
        const deleteFinished = vi.fn();
        renderView({ checkedCount: 1, deleteFinished });
        fireEvent.pointerDown(screen.getByRole("button", { name: "Add item" }));
        act(() => {
          vi.advanceTimersByTime(450);
        });
        // One physical tap = pointerup + trailing click; deletes just once.
        const del = screen.getByRole("button", { name: "Delete finished" });
        fireEvent.pointerUp(del);
        fireEvent.click(del);
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

  describe("sub-item composer", () => {
    it("opens a nested composer and adds children under the parent", () => {
      const addItem = vi.fn().mockReturnValue("k1");
      renderView({ addItem });

      // Edit the item, then tap "Add sub-item".
      fireEvent.click(screen.getByText("Buy milk"));
      fireEvent.click(screen.getByRole("button", { name: "Add sub-item" }));

      // A composer is now open; an item typed into it lands under "i1".
      const input = screen.getByLabelText("Add item");
      fireEvent.change(input, { target: { value: "Skimmed" } });
      fireEvent.submit(input.closest("form")!);
      expect(addItem).toHaveBeenCalledWith("Skimmed", "i1");
    });

    it("hides the floating add button while a sub-item composer is open", () => {
      renderView();
      fireEvent.click(screen.getByText("Buy milk"));
      fireEvent.click(screen.getByRole("button", { name: "Add sub-item" }));
      // The composer's own "Add item" field is present, but the floating
      // add *button* is gone so it doesn't crowd the keyboard.
      expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
    });

    it("keeps Enter on a nested row inside its sub-list", () => {
      // Editing a child and pressing Enter opens a composer directly below that
      // child — the new item lands as its next sibling (after "k", at the same
      // depth), not at the top level and not at the bottom of the parent.
      const addItemAfter = vi.fn().mockReturnValue("k2");
      const nested: ChecklistItem[] = [
        {
          id: "p",
          title: "Clothes",
          checked: false,
          children: [{ id: "k", title: "T-shirts", checked: false }],
        },
      ];
      renderView({ items: nested, addItemAfter });

      fireEvent.click(screen.getByText("T-shirts"));
      const input = titleEditor();
      setText(input, "T-shirts");
      fireEvent.keyDown(input, { key: "Enter" });

      // The composer is open; the next item is inserted right after "k".
      const composer = screen.getByLabelText("Add item");
      fireEvent.change(composer, { target: { value: "Socks" } });
      fireEvent.submit(composer.closest("form")!);
      expect(addItemAfter).toHaveBeenCalledWith("Socks", "k");
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
