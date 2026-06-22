// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

import type { ChecklistItem } from "../../src/domain/types.ts";
import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import {
  ChecklistContext,
  type ChecklistContextValue,
} from "../../src/ui/checklist-context.ts";
import { ReportDragActivityContext } from "../../src/ui/drag-activity.ts";
import { ModalBusProvider } from "../../src/ui/ModalBusProvider.tsx";
import { ToastProvider } from "../../src/ui/toast/Toast.tsx";
import { makeChecklistValue } from "./context-harness.tsx";

// Reordering a row is a pointer drag down the list. Pull-to-refresh watches the
// same downward travel at the document level, so the view must report the drag
// (via `ReportDragActivityContext`) for its duration — otherwise dragging a row
// down would arm a refresh at the same time.

const items: ChecklistItem[] = [
  { id: "i1", title: "one", checked: false },
  { id: "i2", title: "two", checked: false },
  { id: "i3", title: "three", checked: false },
];

function tree(
  value: Partial<ChecklistContextValue>,
  report: (active: boolean) => void,
): ReactElement {
  return (
    <ReportDragActivityContext.Provider value={report}>
      <ToastProvider>
        <ModalBusProvider>
          <ChecklistContext.Provider value={makeChecklistValue(value)}>
            <ChecklistView />
          </ChecklistContext.Provider>
        </ModalBusProvider>
      </ToastProvider>
    </ReportDragActivityContext.Provider>
  );
}

beforeEach(() => {
  if (!(globalThis as { CSS?: unknown }).CSS) {
    (globalThis as { CSS?: unknown }).CSS = { escape: (s: string) => s };
  }
  const captured = new Set<number>();
  HTMLElement.prototype.setPointerCapture = function (id: number) {
    captured.add(id);
  };
  HTMLElement.prototype.hasPointerCapture = function (id: number) {
    return captured.has(id);
  };
  HTMLElement.prototype.releasePointerCapture = function (id: number) {
    captured.delete(id);
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChecklistView reorder drag activity", () => {
  it("reports the drag while a row is lifted, and clears it on release", () => {
    const report = vi.fn();
    render(tree({ items, reorder: vi.fn() }, report));

    // Pick up the middle row — the drag arms on pointer-down.
    const handle = screen.getAllByLabelText("Drag to reorder")[1]!;
    act(() =>
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        clientY: 30,
        button: 0,
        pointerType: "touch",
      }),
    );
    expect(report).toHaveBeenLastCalledWith(true);

    act(() => fireEvent.pointerUp(handle, { pointerId: 1, clientY: 30 }));
    expect(report).toHaveBeenLastCalledWith(false);
  });
});
