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
  it("enters edit mode on press and commits a title change on Enter", () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });

    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByLabelText("Edit item") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Buy oat milk" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledWith("i1", { title: "Buy oat milk" });
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
    expect(screen.queryByRole("textbox", { name: /note/i })).toBeNull();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByPlaceholderText(/markdown supported/i)).toBeTruthy();
  });

  it("the + glyph opens the editor straight onto the note field", () => {
    renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(screen.getByPlaceholderText(/markdown supported/i)).toBeTruthy();
  });

  it("renders an existing note as markdown when expanded", () => {
    renderRow({ item: { ...item, notes: "**bold** note" } });
    // The note is collapsed by default — expand it.
    fireEvent.click(screen.getByRole("button", { name: "Show note" }));
    const strong = screen.getByText("bold");
    expect(strong.tagName).toBe("STRONG");
  });

  it("commits a title + note together from the editor", () => {
    const onEdit = vi.fn();
    renderRow({ item: { ...item, notes: "old" }, onEdit });

    // An item with a note opens the editor (press the title) with the body
    // field already shown as plain text.
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
