// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import type { ChecklistItem } from "../../src/domain/types.ts";
import { ChecklistRow } from "../../src/ui/ChecklistRow.tsx";
import type { DragHandleProps } from "../../src/ui/hooks/useListReorder.ts";

const noop = (): void => {};

// Type into the editor's native input/textarea by setting its value and firing
// the change the controlled field listens on.
function setText(el: HTMLElement, text: string): void {
  fireEvent.change(el, { target: { value: text } });
}

const dragHandleProps: DragHandleProps = {
  onPointerDown: noop,
  onPointerMove: noop,
  onPointerUp: noop,
  onPointerCancel: noop,
};

const item: ChecklistItem = {
  id: "i1",
  title: "Buy milk",
  checked: false,
  archived: false,
};

function renderRow(over: Partial<Parameters<typeof ChecklistRow>[0]> = {}) {
  return render(
    <ul>
      <ChecklistRow
        item={item}
        onToggle={noop}
        onArchive={noop}
        onDelete={noop}
        onEdit={noop}
        dragHandleProps={dragHandleProps}
        dragging={false}
        {...over}
      />
    </ul>,
  );
}

// The sliding foreground is the element carrying the swipe handlers (the
// [touch-action] flex-col wrapper). The title button sits inside an inner
// flex row, so walk up two levels from it.
function foreground(): HTMLElement {
  const title = screen.getByText("Buy milk");
  return title.parentElement!.parentElement as HTMLElement;
}

// jsdom doesn't implement pointer capture; stub the calls the hook makes.
function stubPointerCapture(el: HTMLElement) {
  el.setPointerCapture = noop;
  el.releasePointerCapture = noop;
  el.hasPointerCapture = () => false;
}

// jsdom's PointerEvent ignores the clientX/pointerId init fields the swipe
// hook reads, so build a plain Event and pin those fields on by hand
// (mirrors the edge-swipe / pull-to-refresh tests).
function dispatchPointer(
  el: HTMLElement,
  type: string,
  point: { x: number; y: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: point.x },
    clientY: { value: point.y },
    pointerId: { value: 1 },
    pointerType: { value: "touch" },
    button: { value: 0 },
  });
  act(() => {
    el.dispatchEvent(event);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChecklistRow swipe action layers", () => {
  it("does not expose the Delete button while the row is swiped right to archive", () => {
    renderRow();
    const fg = foreground();
    stubPointerCapture(fg);

    // Drive a right-swipe past the archive threshold (ARCHIVE_AT = 96).
    dispatchPointer(fg, "pointerdown", { x: 0, y: 0 });
    dispatchPointer(fg, "pointermove", { x: 120, y: 0 });

    const deleteBtn = screen.getByText("Delete");
    const deleteLayer = deleteBtn.parentElement as HTMLElement;
    // The right-aligned Delete layer must stay hidden so it is never bared
    // as the foreground clears the row to the right.
    expect(deleteLayer.className).toContain("invisible");
    expect(deleteLayer.getAttribute("aria-hidden")).toBe("true");
  });

  it("reveals the Delete button only while the row is swiped left", () => {
    renderRow();
    const fg = foreground();
    stubPointerCapture(fg);

    // Drive a left-swipe past the open threshold (OPEN_AT = 48).
    dispatchPointer(fg, "pointerdown", { x: 0, y: 0 });
    dispatchPointer(fg, "pointermove", { x: -60, y: 0 });

    const deleteLayer = screen.getByText("Delete").parentElement as HTMLElement;
    expect(deleteLayer.className).not.toContain("invisible");
    expect(deleteLayer.getAttribute("aria-hidden")).toBe("false");

    // ...and the Archive strip is hidden in that direction.
    const archiveLayer = screen.getByText("Archive") as HTMLElement;
    expect(archiveLayer.className).toContain("invisible");
  });
});

describe("ChecklistRow checkbox tap target", () => {
  it("pads the checkbox hit area without enlarging the visual box", () => {
    renderRow();
    // The label wraps the (sr-only) input; padding plus a counteracting
    // negative margin grow the tappable area while keeping the layout — and
    // the visual box's own size — unchanged.
    const label = screen.getByLabelText("Check item")
      .parentElement as HTMLElement;
    expect(label.className).toContain("p-2.5");
    expect(label.className).toContain("-m-2.5");
  });
});

describe("ChecklistRow editing", () => {
  it("edits a note-less item straight away and commits the title on Enter", () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });

    // A note-less item has nothing to reveal, so a title tap edits at once.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "Buy oat milk");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
  });

  // Reveal a clipped editor by scrolling the list container, never the window
  // (which would drag the pinned header). These tests stand in a scroll
  // container around the row, deferring the rAF-scheduled scroll so the row's
  // and container's rects can be mocked before it runs.
  describe("revealing the open editor", () => {
    const rect = (top: number, bottom: number): DOMRect =>
      ({
        top,
        bottom,
        left: 0,
        right: 0,
        width: 0,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    // jsdom does no layout, so give the container a real scrollTop store.
    function stubScrollTop(el: HTMLElement, initial = 0): { get: () => number } {
      let value = initial;
      Object.defineProperty(el, "scrollTop", {
        configurable: true,
        get: () => value,
        set: (v: number) => {
          value = v;
        },
      });
      return { get: () => value };
    }

    function renderInScroller() {
      render(
        <div data-testid="scroller" style={{ overflowY: "auto" }}>
          <ul>
            <ChecklistRow
              item={item}
              onToggle={noop}
              onArchive={noop}
              onDelete={noop}
              onEdit={noop}
              dragHandleProps={dragHandleProps}
              dragging={false}
            />
          </ul>
        </div>,
      );
    }

    function openEditorDeferred(): {
      scroller: HTMLElement;
      root: HTMLElement;
      runScroll: () => void;
      scrollIntoView: ReturnType<typeof vi.fn>;
      restore: () => void;
    } {
      const scrollIntoView = vi.fn();
      const proto = window.HTMLElement.prototype as unknown as {
        scrollIntoView?: (arg?: unknown) => void;
      };
      const prevScroll = proto.scrollIntoView;
      proto.scrollIntoView = scrollIntoView;
      let rafCb: FrameRequestCallback | null = null;
      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          rafCb = cb;
          return 1;
        });

      renderInScroller();
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
      });
      const input = screen.getByLabelText("Edit item");
      const root = input.closest("li")!.firstElementChild as HTMLElement;
      const scroller = screen.getByTestId("scroller");
      return {
        scroller,
        root,
        runScroll: () => act(() => rafCb?.(0)),
        scrollIntoView,
        restore: () => {
          rafSpy.mockRestore();
          proto.scrollIntoView = prevScroll;
        },
      };
    }

    it("scrolls the list container (not the window) to reveal a clipped editor", () => {
      const { scroller, root, runScroll, scrollIntoView, restore } =
        openEditorDeferred();
      try {
        scroller.getBoundingClientRect = () => rect(0, 100);
        root.getBoundingClientRect = () => rect(120, 160);
        const top = stubScrollTop(scroller, 0);

        runScroll();

        // The editor sat 60px below the container's bottom edge, so the
        // container scrolls down by exactly that — and `scrollIntoView` (which
        // would also move the window/header) is never used.
        expect(top.get()).toBe(60);
        expect(scrollIntoView).not.toHaveBeenCalled();
      } finally {
        restore();
      }
    });

    it("leaves the scroll position alone when the editor is already visible", () => {
      const { scroller, root, runScroll, restore } = openEditorDeferred();
      try {
        scroller.getBoundingClientRect = () => rect(0, 200);
        root.getBoundingClientRect = () => rect(40, 90);
        const top = stubScrollTop(scroller, 10);

        runScroll();

        // Fully inside the visible band, so nothing moves — no jump.
        expect(top.get()).toBe(10);
      } finally {
        restore();
      }
    });
  });

  it("edits the item when the row line is clicked beside the title text", () => {
    // The title button only covers the glyphs; tapping the dead space next to
    // it (or the row's padding) used to miss every target and just blur an
    // open editor. The whole line is now a tap target.
    renderRow();
    const line = screen.getByText("Buy milk").closest("div")!;
    fireEvent.click(line);
    expect(screen.getByRole("textbox", { name: "Edit item" })).toBeTruthy();
  });

  it("does not edit when an in-row control is clicked", () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });
    // Clicking the checkbox toggles without dropping into the editor — the
    // row-line handler ignores clicks that land on a real control.
    fireEvent.click(screen.getByLabelText("Check item"));
    expect(onToggle).toHaveBeenCalledWith("i1");
    expect(screen.queryByRole("textbox", { name: "Edit item" })).toBeNull();
  });

  it("opens a draft below this row after committing a title on Enter", () => {
    const onEdit = vi.fn();
    const onAddAfter = vi.fn();
    renderRow({ onEdit, onAddAfter });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "Buy oat milk");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
    // The draft is anchored to this row, so the new item lands right below it.
    expect(onAddAfter).toHaveBeenCalledWith("i1");
  });

  it("does not chain a draft when Shift+Enter reveals the body", () => {
    const onAddAfter = vi.fn();
    renderRow({ onAddAfter });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(onAddAfter).not.toHaveBeenCalled();
  });

  it("commits on blur without chaining a draft", () => {
    const onEdit = vi.fn();
    const onAddAfter = vi.fn();
    renderRow({ onEdit, onAddAfter });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "Buy oat milk");
    fireEvent.blur(input);

    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
    expect(onAddAfter).not.toHaveBeenCalled();
  });

  it("cancels on Escape without committing", () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "Changed");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onEdit).not.toHaveBeenCalled();
    // Back to view mode — the title is a button again.
    expect(screen.getByRole("button", { name: "Edit item" })).toBeTruthy();
  });

  it("reveals the body field on Shift+Enter", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item");
    expect(screen.queryByLabelText(/markdown supported/i)).toBeNull();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByLabelText(/markdown supported/i)).toBeTruthy();
  });

  it("opens straight into the body editor when autoEditBody is set", () => {
    // The composer sets this on the row it just created with Shift+Enter so
    // a fresh item flows on into editing its note.
    const onAutoEditConsumed = vi.fn();
    renderRow({ autoEditBody: true, onAutoEditConsumed });

    expect(screen.getByLabelText(/markdown supported/i)).toBeTruthy();
    // The flag is consumed once so it doesn't re-open on a later render.
    expect(onAutoEditConsumed).toHaveBeenCalledTimes(1);
  });

  it("ignores autoEditBody when notes are disabled", () => {
    const onAutoEditConsumed = vi.fn();
    renderRow({ autoEditBody: true, notesDisabled: true, onAutoEditConsumed });

    // Nothing to edit with notes off — the row stays in view mode.
    expect(screen.queryByLabelText(/markdown supported/i)).toBeNull();
    expect(onAutoEditConsumed).not.toHaveBeenCalled();
  });

  it("adds a note from the editor's Add-note affordance", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(screen.getByLabelText(/markdown supported/i)).toBeTruthy();
  });

  it("commits and opens a sub-item composer from the Add-sub-item button", () => {
    const onEdit = vi.fn();
    const onAddChild = vi.fn();
    renderRow({ onEdit, onAddChild });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "Clothes");
    fireEvent.click(screen.getByRole("button", { name: "Add sub-item" }));

    // The title edit lands first, then the parent is asked to nest under it.
    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Clothes" });
    expect(onAddChild).toHaveBeenCalledWith("i1");
  });

  it("offers no Add-sub-item button when nesting isn't wired", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(screen.queryByRole("button", { name: "Add sub-item" })).toBeNull();
  });

  it("routes Enter to the after-this-row draft, not the sub-item composer", () => {
    // Enter always opens the draft below this row (a sibling at its own depth);
    // the sub-item composer is reserved for the explicit "Add sub-item" button.
    const onAddAfter = vi.fn();
    const onAddChild = vi.fn();
    renderRow({ onAddAfter, onAddChild });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "Top");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onAddAfter).toHaveBeenCalledWith("i1");
    expect(onAddChild).not.toHaveBeenCalled();
  });

  it("reveals a body on the first title tap, then edits on the second", () => {
    const onEdit = vi.fn();
    renderRow({ item: { ...item, notes: "**bold** note" }, onEdit });

    // First tap reveals (renders markdown), it does not enter the editor.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.queryByLabelText(/markdown supported/i)).toBeNull();

    // Second tap on the title opens the editor with the body shown as text.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/markdown supported/i)).toBeTruthy();
  });

  it("expands the body from the hint chevron", () => {
    renderRow({ item: { ...item, notes: "**bold** note" } });
    fireEvent.click(screen.getByRole("button", { name: "Show note" }));
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("renders title-only with notes disabled — no chevron, no rendered body", () => {
    renderRow({
      item: { ...item, notes: "**bold** note" },
      notesDisabled: true,
    });

    // The expand chevron is gone and the body never renders.
    expect(screen.queryByRole("button", { name: "Show note" })).toBeNull();
    expect(screen.queryByText("bold")).toBeNull();

    // A title tap edits straight away rather than revealing the body.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(screen.getByLabelText("Edit item")).toBeTruthy();
    expect(screen.queryByText("bold")).toBeNull();
  });

  it("hides the note field and affordances in the editor with notes disabled", () => {
    renderRow({ notesDisabled: true });
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));

    // No "Add a note" button, and Shift+Enter commits instead of revealing.
    expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
    const input = screen.getByLabelText("Edit item");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.queryByLabelText(/markdown supported/i)).toBeNull();
  });

  it("preserves an existing note when editing the title with notes disabled", () => {
    const onEdit = vi.fn();
    renderRow({
      item: { ...item, notes: "keep me" },
      onEdit,
      notesDisabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "Buy oat milk");
    fireEvent.keyDown(input, { key: "Enter" });

    // Only the title is sent — the note is untouched in the document.
    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
  });

  it("removes the item when committed empty instead of keeping a blank line", () => {
    const onEdit = vi.fn();
    const onRemoveEmpty = vi.fn();
    renderRow({ onEdit, onRemoveEmpty });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "");
    fireEvent.blur(input);

    expect(onRemoveEmpty).toHaveBeenCalledWith("i1");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("keeps an item with a stored note when only its title is emptied", () => {
    const onEdit = vi.fn();
    const onRemoveEmpty = vi.fn();
    renderRow({ item: { ...item, notes: "keep me" }, onEdit, onRemoveEmpty });

    // Reveal then edit the title; erase it and blur. The note must survive, so
    // the item is edited (a no-op title), not removed.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "");
    fireEvent.blur(input);

    expect(onRemoveEmpty).not.toHaveBeenCalled();
  });

  it("backs up to the line above on Backspace in an empty title", () => {
    const onBackspaceEmpty = vi.fn().mockReturnValue(true);
    renderRow({ onBackspaceEmpty });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "");
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onBackspaceEmpty).toHaveBeenCalledWith("i1");
  });

  it("does not back up on Backspace while the title still has text", () => {
    const onBackspaceEmpty = vi.fn().mockReturnValue(true);
    renderRow({ onBackspaceEmpty });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    setText(input, "x");
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onBackspaceEmpty).not.toHaveBeenCalled();
  });

  it("opens straight into the title editor when autoEditTitle is set", () => {
    const onAutoEditTitleConsumed = vi.fn();
    renderRow({ autoEditTitle: true, onAutoEditTitleConsumed });

    // The title field is focused and ready (no body field forced open).
    const input = screen.getByLabelText("Edit item") as HTMLElement;
    expect(input).toBeTruthy();
    expect(screen.queryByLabelText(/markdown supported/i)).toBeNull();
    expect(onAutoEditTitleConsumed).toHaveBeenCalledTimes(1);
  });

  it("toggles the item from the editor's checkbox while editing", () => {
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    renderRow({ onToggle, onEdit });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    // The checkbox stays live while the row is in edit mode.
    fireEvent.click(screen.getByLabelText("Check item"));

    expect(onToggle).toHaveBeenCalledWith("i1");
    // The editor is still open — toggling doesn't commit/close it.
    expect(screen.getByLabelText("Edit item")).toBeTruthy();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("suppresses the checkbox press default so the title input keeps focus", () => {
    // On iOS the label doesn't take focus, so without this the title input
    // would blur and the editor would commit/close before the toggle landed.
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const checkbox = screen.getByLabelText("Check item");
    const mouseDown = createEvent.mouseDown(checkbox);
    fireEvent(checkbox, mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it("reports its item id as editing opens and clears it as it closes", () => {
    const onActiveEditorChange = vi.fn();
    renderRow({ onActiveEditorChange });

    // No editor mounted yet, so nothing is reported.
    expect(onActiveEditorChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(onActiveEditorChange).toHaveBeenLastCalledWith("i1");

    // Closing the editor (Escape) clears the reported id.
    fireEvent.keyDown(screen.getByLabelText("Edit item"), { key: "Escape" });
    expect(onActiveEditorChange).toHaveBeenLastCalledWith(null);
  });

  it("commits a title + note together from the editor", () => {
    const onEdit = vi.fn();
    renderRow({ item: { ...item, notes: "old" }, onEdit });

    // Reveal, then a second title tap opens the editor with the body field
    // already shown as plain text.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const note = screen.getByLabelText(/markdown supported/i);
    setText(note, "new body");
    fireEvent.keyDown(note, { key: "Enter", ctrlKey: true });

    expect(onEdit).toHaveBeenCalledWith("i1", {
      title: "Buy milk",
      notes: "new body",
    });
  });
});

describe("ChecklistRow sub-items", () => {
  afterEach(cleanup);

  it("shows no caret on a childless row", () => {
    renderRow();
    expect(screen.queryByLabelText(/sub-items/i)).toBeNull();
  });

  it("toggles the sub-list open and closed via the caret", () => {
    const onToggleCollapse = vi.fn();
    renderRow({ hasChildren: true, collapsed: false, onToggleCollapse });
    const caret = screen.getByLabelText("Hide sub-items");
    expect(caret.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(caret);
    expect(onToggleCollapse).toHaveBeenCalledWith("i1");
  });

  it("labels the caret for expanding when collapsed", () => {
    renderRow({ hasChildren: true, collapsed: true });
    const caret = screen.getByLabelText("Show sub-items");
    expect(caret.getAttribute("aria-expanded")).toBe("false");
  });

  it("indents a nested row by its depth", () => {
    renderRow({ depth: 2 });
    const fg = foreground();
    expect(fg.style.paddingLeft).toContain("64px"); // 2 × 32
  });

  // A sub-item should read as a genuine child line: smaller title text and a
  // smaller checkbox square than a top-level row.
  it("renders a top-level row at full size", () => {
    renderRow();
    const box = screen
      .getByLabelText("Check item")
      .parentElement!.querySelector("span[aria-hidden]") as HTMLElement;
    expect(box.className).toContain("h-5");
    expect(box.className).toContain("w-5");
    const title = screen.getByRole("button", { name: "Edit item" });
    expect(title.className).not.toContain("text-sm");
  });

  it("shrinks the title and checkbox of a nested row", () => {
    renderRow({ depth: 1 });
    const box = screen
      .getByLabelText("Check item")
      .parentElement!.querySelector("span[aria-hidden]") as HTMLElement;
    // The drawn square is smaller…
    expect(box.className).toContain("h-4");
    expect(box.className).toContain("w-4");
    // …and the title text steps down a size.
    const title = screen.getByRole("button", { name: "Edit item" });
    expect(title.className).toContain("text-sm");
  });

  it("keeps the full tap target on a nested checkbox", () => {
    // Only the visual box shrinks — the padding that grows the hit area is
    // unchanged, so a sub-item's checkbox is just as easy to hit.
    renderRow({ depth: 1 });
    const label = screen.getByLabelText("Check item")
      .parentElement as HTMLElement;
    expect(label.className).toContain("p-2.5");
    expect(label.className).toContain("-m-2.5");
  });

  it("tints the row when it is the active 'into' drop target", () => {
    const { container } = renderRow({ dropMode: "into" });
    expect(container.querySelector("li")!.className).toContain("ring-accent");
  });

  it("draws no edge line for sibling (before / after) drops", () => {
    // Sibling drops are shown by the ghost preview snapping into the gap, not
    // by a line on this row — a line on the parent's edge would sit between it
    // and its own children for an "after" drop. Only the "into" tint remains.
    const before = renderRow({ dropMode: "before" });
    expect(before.container.querySelector("li")!.className).not.toContain(
      "ring-accent",
    );
    expect(before.container.querySelector(".top-0")).toBeNull();
    cleanup();
    const after = renderRow({ dropMode: "after" });
    expect(after.container.querySelector(".bottom-0")).toBeNull();
  });
});
