// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

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
        dragHandleProps={dragHandleProps}
        dragging={false}
        {...over}
      />
    </ul>,
  );
}

// The sliding foreground is the element carrying the swipe handlers; it's
// the row's checkbox's nearest [touch-action] ancestor. Grab it by walking
// up from the title span.
function foreground(): HTMLElement {
  const title = screen.getByText("Buy milk");
  return title.parentElement as HTMLElement;
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
