// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import type { ChecklistItem } from "../../src/domain/types.ts";
import { ChecklistRow } from "../../src/ui/ChecklistRow.tsx";
import type { DragHandleProps } from "../../src/ui/hooks/useListReorder.ts";

const noop = (): void => {};

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

describe("ChecklistRow editing", () => {
  it("edits a note-less item straight away and commits the title on Enter", () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });

    // A note-less item has nothing to reveal, so a title tap edits at once.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
  });

  it("opens a fresh draft after committing a title on Enter", () => {
    const onEdit = vi.fn();
    const onAddAfter = vi.fn();
    renderRow({ onEdit, onAddAfter });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
    expect(onAddAfter).toHaveBeenCalledTimes(1);
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
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.blur(input);

    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
    expect(onAddAfter).not.toHaveBeenCalled();
  });

  it("cancels on Escape without committing", () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onEdit).not.toHaveBeenCalled();
    // Back to view mode — the title is a button again.
    expect(screen.getByRole("button", { name: "Edit item" })).toBeTruthy();
  });

  it("reveals the body field on Shift+Enter", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item");
    expect(screen.queryByPlaceholderText(/markdown supported/i)).toBeNull();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByPlaceholderText(/markdown supported/i)).toBeTruthy();
  });

  it("opens straight into the body editor when autoEditBody is set", () => {
    // The composer sets this on the row it just created with Shift+Enter so
    // a fresh item flows on into editing its note.
    const onAutoEditConsumed = vi.fn();
    renderRow({ autoEditBody: true, onAutoEditConsumed });

    expect(screen.getByPlaceholderText(/markdown supported/i)).toBeTruthy();
    // The flag is consumed once so it doesn't re-open on a later render.
    expect(onAutoEditConsumed).toHaveBeenCalledTimes(1);
  });

  it("ignores autoEditBody when notes are disabled", () => {
    const onAutoEditConsumed = vi.fn();
    renderRow({ autoEditBody: true, notesDisabled: true, onAutoEditConsumed });

    // Nothing to edit with notes off — the row stays in view mode.
    expect(screen.queryByPlaceholderText(/markdown supported/i)).toBeNull();
    expect(onAutoEditConsumed).not.toHaveBeenCalled();
  });

  it("adds a note from the editor's Add-note affordance", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(screen.getByPlaceholderText(/markdown supported/i)).toBeTruthy();
  });

  it("reveals a body on the first title tap, then edits on the second", () => {
    const onEdit = vi.fn();
    renderRow({ item: { ...item, notes: "**bold** note" }, onEdit });

    // First tap reveals (renders markdown), it does not enter the editor.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.queryByPlaceholderText(/markdown supported/i)).toBeNull();

    // Second tap on the title opens the editor with the body shown as text.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/markdown supported/i)).toBeTruthy();
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
    expect(screen.queryByPlaceholderText(/markdown supported/i)).toBeNull();
  });

  it("preserves an existing note when editing the title with notes disabled", () => {
    const onEdit = vi.fn();
    renderRow({
      item: { ...item, notes: "keep me" },
      onEdit,
      notesDisabled: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Only the title is sent — the note is untouched in the document.
    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
  });

  it("removes the item when committed empty instead of keeping a blank line", () => {
    const onEdit = vi.fn();
    const onRemoveEmpty = vi.fn();
    renderRow({ onEdit, onRemoveEmpty });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
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
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(onRemoveEmpty).not.toHaveBeenCalled();
  });

  it("backs up to the line above on Backspace in an empty title", () => {
    const onBackspaceEmpty = vi.fn().mockReturnValue(true);
    renderRow({ onBackspaceEmpty });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onBackspaceEmpty).toHaveBeenCalledWith("i1");
  });

  it("does not back up on Backspace while the title still has text", () => {
    const onBackspaceEmpty = vi.fn().mockReturnValue(true);
    renderRow({ onBackspaceEmpty });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onBackspaceEmpty).not.toHaveBeenCalled();
  });

  it("opens straight into the title editor when autoEditTitle is set", () => {
    const onAutoEditTitleConsumed = vi.fn();
    renderRow({ autoEditTitle: true, onAutoEditTitleConsumed });

    // The title field is focused and ready (no body field forced open).
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(screen.queryByPlaceholderText(/markdown supported/i)).toBeNull();
    expect(onAutoEditTitleConsumed).toHaveBeenCalledTimes(1);
  });

  it("commits a title + note together from the editor", () => {
    const onEdit = vi.fn();
    renderRow({ item: { ...item, notes: "old" }, onEdit });

    // Reveal, then a second title tap opens the editor with the body field
    // already shown as plain text.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const note = screen.getByPlaceholderText(/markdown supported/i);
    fireEvent.change(note, { target: { value: "new body" } });
    fireEvent.keyDown(note, { key: "Enter", ctrlKey: true });

    expect(onEdit).toHaveBeenCalledWith("i1", {
      title: "Buy milk",
      notes: "new body",
    });
  });
});
