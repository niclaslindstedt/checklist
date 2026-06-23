// @vitest-environment jsdom
//
// A touch drag of a checklist must light up the target under the finger — the
// folder it would be filed into, or the ungrouped "no folder" zone it would
// drop back to. These exercise the full wiring: a long-press drag through the
// real `SideMenu` (wrapped in the drag provider), with `elementFromPoint`
// stubbed to the hovered drop target, asserting the highlight classes appear on
// the element the user actually sees (the opaque foreground layer, not a div
// hidden behind it).
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SideMenu } from "../../src/ui/SideMenu.tsx";
import { ChecklistDragProvider } from "../../src/ui/checklist-drag.tsx";
import { ModalBusProvider } from "../../src/ui/ModalBusProvider.tsx";
import {
  ChecklistContext,
  type ChecklistContextValue,
} from "../../src/ui/checklist-context.ts";
import { NavContext } from "../../src/ui/nav-context.ts";
import { makeChecklistValue, makeNavValue } from "./context-harness.tsx";

function noop(): void {}

beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

// A folder with one list inside it and one loose list outside any folder.
const foldered: Partial<ChecklistContextValue> = {
  folders: [{ id: "f1", name: "Work", count: 1 }],
  checklists: [
    { id: "c1", name: "Filed list", remaining: 0, folderId: "f1" },
    { id: "c2", name: "Loose list", remaining: 0 },
  ],
  activeChecklistId: "c1",
};

function renderMenu() {
  return render(
    <ModalBusProvider>
      <NavContext.Provider value={makeNavValue({ open: true })}>
        <ChecklistContext.Provider value={makeChecklistValue(foldered)}>
          <ChecklistDragProvider onDrop={noop}>
            <SideMenu
              namespaces={[{ slug: "default", name: "Default" }]}
              activeNamespace="default"
              onSwitchNamespace={noop}
              onRemoveNamespace={async () => {}}
            />
          </ChecklistDragProvider>
        </ChecklistContext.Provider>
      </NavContext.Provider>
    </ModalBusProvider>,
  );
}

const touch = { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10 };

// Press-and-hold the loose list, then drag the finger over `target`. Leaves the
// list held (no pointerup) so the hover highlight can be asserted mid-drag.
function pickUpAndHoverOver(row: Element, target: Element) {
  vi.spyOn(document, "elementFromPoint").mockReturnValue(target as Element);
  fireEvent.pointerDown(row, touch);
  act(() => void vi.advanceTimersByTime(400));
  act(() =>
    fireEvent.pointerMove(row, { ...touch, clientX: 50, clientY: 200 }),
  );
}

describe("SideMenu touch-drag highlight", () => {
  it("highlights the folder under the finger on the visible foreground layer", () => {
    const { container, getByRole } = renderMenu();
    const folderEl = container.querySelector('[data-checklist-drop="f1"]')!;
    // Nothing highlighted before the drag: the folder shows its plain surface.
    expect(folderEl.querySelector('[class*="bg-accent/15"]')).toBeNull();

    pickUpAndHoverOver(getByRole("menuitem", { name: /Loose list/ }), folderEl);

    // The accent tint must land on the opaque foreground layer (the one that
    // carries the folder header) — not on a wrapper hidden behind `bg-surface`,
    // which is what previously swallowed the highlight on touch.
    const lit = folderEl.querySelector('[class*="bg-accent/15"]');
    expect(lit).toBeTruthy();
    expect(lit!.className).toContain("touch-action:pan-y");
    expect(lit!.className).not.toContain("bg-surface");
  });

  it("frames the no-folder zone when a list hovers the ungrouped area", () => {
    const { container, getByRole } = renderMenu();
    const rootEl = container.querySelector('[data-checklist-drop="__root__"]')!;
    // No frame until a drag hovers the root zone.
    expect(container.querySelector('[class*="ring-accent/50"]')).toBeNull();

    pickUpAndHoverOver(getByRole("menuitem", { name: /Loose list/ }), rootEl);

    // The ungrouped region (below the folders) gets a bordered frame so it's
    // clear the list will land outside every folder.
    expect(container.querySelector('[class*="ring-accent/50"]')).toBeTruthy();
  });

  it("does not frame the no-folder zone while a folder is the target", () => {
    const { container, getByRole } = renderMenu();
    const folderEl = container.querySelector('[data-checklist-drop="f1"]')!;

    pickUpAndHoverOver(getByRole("menuitem", { name: /Loose list/ }), folderEl);

    // Hovering a folder lights the folder, not the ungrouped frame.
    expect(container.querySelector('[class*="ring-accent/50"]')).toBeNull();
  });
});
