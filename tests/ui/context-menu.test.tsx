// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ContextMenu } from "../../src/ui/ContextMenu.tsx";
import { ArchiveView } from "../../src/ui/ArchiveView.tsx";
import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import { SideMenu } from "../../src/ui/SideMenu.tsx";
import { ChecklistContext } from "../../src/ui/checklist-context.ts";
import { NavContext } from "../../src/ui/nav-context.ts";
import { ModalBusProvider } from "../../src/ui/ModalBusProvider.tsx";
import type { ArchivedGroup } from "../../src/domain/checklists.ts";
import {
  makeChecklistValue,
  makeNavValue,
  renderWithChecklist,
} from "./context-harness.tsx";

function noop(): void {}

// A coarse stand-in for `window.matchMedia` that reports the desktop pointer
// query (the only one carrying "hover") as a match, so `useDesktopPointer`
// flips on. Other queries (e.g. the pinned-sidebar min-width) stay false.
function enableDesktopPointer() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("hover"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextMenu", () => {
  it("renders its items and fires select + close on click", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      <ContextMenu
        x={10}
        y={10}
        items={[{ label: "Archive", onSelect }]}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        x={10}
        y={10}
        items={[{ label: "Archive", onSelect: noop }]}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SideMenu right-click menu (desktop)", () => {
  function renderMenu(checklist = {}) {
    return render(
      <ModalBusProvider>
        <NavContext.Provider value={makeNavValue({ open: true })}>
          <ChecklistContext.Provider
            value={makeChecklistValue({
              checklists: [
                { id: "c1", name: "Groceries", remaining: 0 },
                { id: "c2", name: "Packing", remaining: 0 },
              ],
              activeChecklistId: "c1",
              ...checklist,
            })}
          >
            <SideMenu
              namespaces={[{ slug: "default", name: "Default" }]}
              activeNamespace="default"
              onSwitchNamespace={noop}
              onRemoveNamespace={async () => {}}
            />
          </ChecklistContext.Provider>
        </NavContext.Provider>
      </ModalBusProvider>,
    );
  }

  it("drops the swipe trash for a right-click archive/delete menu", () => {
    enableDesktopPointer();
    const archiveChecklist = vi.fn();
    renderMenu({ archiveChecklist });
    // Desktop has no swipe-revealed trash buttons.
    expect(
      screen.queryByRole("button", { name: "Delete checklist" }),
    ).toBeNull();

    fireEvent.contextMenu(screen.getByRole("menuitem", { name: /Packing/ }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Archive" }));
    expect(archiveChecklist).toHaveBeenCalledWith("c2");
  });

  it("deletes a list through the right-click menu", () => {
    enableDesktopPointer();
    const removeChecklist = vi.fn();
    renderMenu({ removeChecklist });
    fireEvent.contextMenu(screen.getByRole("menuitem", { name: /Packing/ }));
    const menu = screen.getByRole("menu");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Delete checklist" }),
    );
    expect(removeChecklist).toHaveBeenCalledWith("c2");
  });
});

describe("ChecklistView right-click menu (desktop)", () => {
  it("archives an item via the right-click menu instead of a swipe", () => {
    enableDesktopPointer();
    const archive = vi.fn();
    renderWithChecklist(<ChecklistView />, {
      items: [{ id: "i1", title: "Milk", checked: false }],
      archive,
    });
    const row = screen.getByText("Milk").closest("li")!;
    fireEvent.contextMenu(row);
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Archive" }));
    expect(archive).toHaveBeenCalledWith("i1");
  });
});

describe("ArchiveView right-click menu (desktop)", () => {
  const groups: ArchivedGroup[] = [
    {
      id: "list-1",
      name: "Groceries",
      items: [{ id: "i1", title: "Old milk", checked: true, archived: true }],
    },
  ];

  it("lists archived whole lists and restores one via the menu", () => {
    enableDesktopPointer();
    const unarchiveChecklist = vi.fn();
    renderWithChecklist(<ArchiveView />, {
      archivedGroups: groups,
      archivedChecklists: [{ id: "al1", name: "Retired list", remaining: 2 }],
      unarchiveChecklist,
    });
    expect(
      screen.getByRole("heading", { name: "Archived lists" }),
    ).toBeTruthy();
    // Desktop hides the inline buttons in favour of the menu.
    expect(screen.queryByLabelText("Restore item")).toBeNull();

    fireEvent.contextMenu(screen.getByText("Retired list").closest("li")!);
    const menu = screen.getByRole("menu");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Restore list" }),
    );
    expect(unarchiveChecklist).toHaveBeenCalledWith("al1");
  });
});
