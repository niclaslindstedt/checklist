// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

import type { ChecklistItem } from "../../src/domain/types.ts";
import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import {
  ChecklistContext,
  type ChecklistContextValue,
  type SyncInfo,
} from "../../src/ui/checklist-context.ts";
import { ModalBusProvider } from "../../src/ui/ModalBusProvider.tsx";
import { ToastProvider } from "../../src/ui/toast/Toast.tsx";
import { makeChecklistValue } from "./context-harness.tsx";

// A drag holds a pointer capture and floats the lifted row above the list.
// When a background save collides mid-drag, the non-dismissable conflict modal
// appears — and the view must tear the drag down, or the lifted row sits frozen
// over the modal swallowing the taps meant to resolve it.

const items: ChecklistItem[] = [
  { id: "i1", title: "one", checked: false },
  { id: "i2", title: "two", checked: false },
  { id: "i3", title: "three", checked: false },
];

function makeSync(status: SyncInfo["status"]): SyncInfo {
  return {
    backend: "dropbox",
    namespace: "default",
    providerName: "Dropbox",
    status,
    statusDetail: null,
    dirty: false,
    offline: false,
    onSave: () => {},
    onOpenDetails: () => {},
    onReconnect: null,
    onCheckConnection: async () => "offline",
  };
}

function tree(value: Partial<ChecklistContextValue>): ReactElement {
  return (
    <ToastProvider>
      <ModalBusProvider>
        <ChecklistContext.Provider value={makeChecklistValue(value)}>
          <ChecklistView />
        </ChecklistContext.Provider>
      </ModalBusProvider>
    </ToastProvider>
  );
}

// The lifted row is the only one styled `position: absolute` while a drag is in
// flight; count them to tell whether a drag is active.
function liftedRowCount(): number {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-reorder-id]"),
  ).filter((el) => el.style.position === "absolute").length;
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

describe("ChecklistView drag + conflict", () => {
  it("tears the drag down when a sync conflict surfaces", () => {
    const reorder = vi.fn();
    const { rerender } = render(
      tree({ items, reorder, sync: makeSync("saving") }),
    );

    // Pick up the middle row — the lift style applies on pointer-down.
    const handle = screen.getAllByLabelText("Drag to reorder")[1]!;
    act(() =>
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        clientY: 30,
        button: 0,
        pointerType: "touch",
      }),
    );
    expect(liftedRowCount()).toBe(1);

    // A background save collides: the status flips to "conflict".
    rerender(tree({ items, reorder, sync: makeSync("conflict") }));

    // The drag is abandoned — no row is left lifted, and nothing was committed.
    expect(liftedRowCount()).toBe(0);
    expect(reorder).not.toHaveBeenCalled();
  });
});
