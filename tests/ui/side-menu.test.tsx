// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

import { SideMenu } from "../../src/ui/SideMenu.tsx";
import { ModalBusProvider } from "../../src/ui/ModalBusProvider.tsx";
import { useModalState } from "../../src/ui/modal-bus.ts";
import {
  ChecklistContext,
  type ChecklistContextValue,
} from "../../src/ui/checklist-context.ts";
import { NavContext, type NavContextValue } from "../../src/ui/nav-context.ts";
import type { ChecklistItem } from "../../src/domain/types.ts";
import { setFooterCollapsed } from "../../src/ui/hooks/useFooterCollapsed.ts";
import { makeChecklistValue, makeNavValue } from "./context-harness.tsx";

function noop(): void {}

// Surfaces the bus modal a footer action opened, so a test can assert the
// dispatched command without reaching into the provider's internals.
function OpenModalProbe() {
  const settings = useModalState("settings").command !== null;
  const changelog = useModalState("changelog").command !== null;
  const namespaces = useModalState("namespaces").command !== null;
  const open = [
    settings && "settings",
    changelog && "changelog",
    namespaces && "namespaces",
  ].filter(Boolean);
  return <span data-testid="open-modal">{open.join(",")}</span>;
}

// jsdom has no PointerEvent constructor, so `fireEvent.pointer*` drops the
// coordinates the drag hook reads. Dispatch a plain Event with the few
// fields the hook touches assigned onto it (mirrors how the
// pull-to-refresh test fakes a TouchEvent).
function pointer(el: Element, type: string, coords: { x: number; y: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    button: 0,
    pointerType: "touch",
    clientX: coords.x,
    clientY: coords.y,
  });
  fireEvent(el, event);
}

type Options = {
  nav?: Partial<NavContextValue>;
  checklist?: Partial<ChecklistContextValue>;
  props?: Partial<React.ComponentProps<typeof SideMenu>>;
};

// SideMenu reads open/current/position from nav context and undo/redo/
// archive counts from the checklist context; only the namespace list stays
// a prop. Each test seeds the slices it asserts on.
function tree({ nav = {}, checklist = {}, props = {} }: Options): ReactElement {
  return (
    <ModalBusProvider>
      <NavContext.Provider value={makeNavValue(nav)}>
        <ChecklistContext.Provider value={makeChecklistValue(checklist)}>
          <SideMenu
            namespaces={[{ slug: "default", name: "Default" }]}
            activeNamespace="default"
            onSwitchNamespace={noop}
            onRemoveNamespace={async () => {}}
            {...props}
          />
          <OpenModalProbe />
        </ChecklistContext.Provider>
      </NavContext.Provider>
    </ModalBusProvider>
  );
}

function renderMenu(options: Options = {}) {
  const result = render(tree(options));
  return {
    ...result,
    rerenderWith: (next: Options) => result.rerender(tree(next)),
  };
}

function archived(count: number): ChecklistItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i}`,
    title: `Archived ${i}`,
    checked: false,
    archived: true,
  }));
}

describe("SideMenu", () => {
  it("keeps the drawer collapsed until the floating button is pressed", () => {
    const toggle = vi.fn();
    renderMenu({ nav: { toggle } });
    // The nav entries aren't in the tree while collapsed.
    expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Open navigation"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("hides the floating button when showButton is off", () => {
    renderMenu({ nav: { showButton: false } });
    // No toggle to press — the edge swipe opens the drawer instead.
    expect(screen.queryByLabelText("Open navigation")).toBeNull();
  });

  it("still renders the open drawer with the button hidden", () => {
    renderMenu({ nav: { open: true, showButton: false } });
    expect(screen.getByRole("menuitem", { name: /Archive/ })).toBeTruthy();
  });

  it("lists both views and navigates when one is chosen", () => {
    const navigate = vi.fn();
    renderMenu({ nav: { open: true, navigate } });
    expect(screen.getByRole("menuitem", { name: /Checklist/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Archive/ }));
    expect(navigate).toHaveBeenCalledWith("archive");
  });

  it("lists every checklist by name and switches the active one", () => {
    const navigate = vi.fn();
    const selectChecklist = vi.fn();
    renderMenu({
      nav: { open: true, navigate },
      checklist: {
        checklists: [
          { id: "c1", name: "Groceries", remaining: 0 },
          { id: "c2", name: "Packing", remaining: 0 },
        ],
        activeChecklistId: "c1",
        selectChecklist,
      },
    });
    expect(screen.getByRole("menuitem", { name: /Groceries/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Packing/ }));
    expect(selectChecklist).toHaveBeenCalledWith("c2");
    expect(navigate).toHaveBeenCalledWith("checklist");
  });

  it("badges a checklist with its not-yet-completed item count", () => {
    renderMenu({
      nav: { open: true },
      checklist: {
        checklists: [
          { id: "c1", name: "Groceries", remaining: 3 },
          { id: "c2", name: "Packing", remaining: 0 },
        ],
        activeChecklistId: "c1",
      },
    });
    // The list with outstanding items reads its name and the count.
    expect(
      screen.getByRole("menuitem", { name: /Groceries/ }).textContent,
    ).toContain("3");
    // A fully-completed (or empty) list shows no badge.
    expect(
      screen.getByRole("menuitem", { name: /Packing/ }).textContent,
    ).not.toContain("0");
  });

  it("draws a checklist's picked glyph tinted with its accent colour", () => {
    renderMenu({
      nav: { open: true },
      checklist: {
        checklists: [
          {
            id: "c1",
            name: "Groceries",
            remaining: 0,
            glyph: "cart",
            color: "#98c379",
          },
          { id: "c2", name: "Packing", remaining: 0 },
        ],
        activeChecklistId: "c1",
      },
    });
    // The styled list shows its own mark (the cart's wheel circles are not
    // part of the generic checklist icon), tinted with its accent.
    const styled = screen
      .getByRole("menuitem", { name: /Groceries/ })
      .querySelector("svg")!;
    expect(styled.querySelector("circle")).not.toBeNull();
    expect(styled.style.color).toBe("rgb(152, 195, 121)");
    // An unstyled list keeps the untinted generic checklist mark.
    const plain = screen
      .getByRole("menuitem", { name: /Packing/ })
      .querySelector("svg")!;
    expect(plain.querySelector("circle")).toBeNull();
    expect(plain.style.color).toBe("");
  });

  it("adds a checklist from the action bar's New list button", () => {
    const addChecklist = vi.fn();
    const navigate = vi.fn();
    renderMenu({
      nav: { open: true, navigate },
      checklist: { addChecklist },
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "New checklist" }));
    expect(addChecklist).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("checklist");
  });

  it("marks the current view as the active page", () => {
    renderMenu({ nav: { open: true, current: "archive" } });
    const archive = screen.getByRole("menuitem", { name: /Archive/ });
    expect(archive.getAttribute("aria-current")).toBe("page");
  });

  it("shows the archived count as a badge when there are archived items", () => {
    renderMenu({
      nav: { open: true },
      checklist: {
        archivedGroups: [{ id: "l1", name: "List", items: archived(3) }],
      },
    });
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("invokes undo / redo and disables them when there's no history", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    renderMenu({
      nav: { open: true },
      checklist: { undo, redo, canUndo: true, canRedo: false },
    });
    const undoItem = screen.getByRole("menuitem", { name: "Undo" });
    const redoItem = screen.getByRole("menuitem", { name: "Redo" });
    expect((redoItem as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(redoItem);
    expect(redo).not.toHaveBeenCalled();
    fireEvent.click(undoItem);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("lists namespaces and switches when one is chosen", () => {
    const onSwitchNamespace = vi.fn();
    const close = vi.fn();
    renderMenu({
      nav: { open: true, close },
      props: {
        onSwitchNamespace,
        namespaces: [
          { slug: "default", name: "Default" },
          { slug: "family", name: "Family" },
        ],
        activeNamespace: "default",
      },
    });
    // The namespace list folds shut by default — only the active one shows
    // until the heading is expanded.
    expect(screen.queryByRole("menuitem", { name: /Family/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Namespace" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Family/ }));
    expect(onSwitchNamespace).toHaveBeenCalledWith("family");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("folds the namespace list shut by default, showing only the active one", () => {
    renderMenu({
      nav: { open: true },
      props: {
        namespaces: [
          { slug: "default", name: "Default" },
          { slug: "family", name: "Family" },
        ],
        activeNamespace: "default",
      },
    });
    // Collapsed: the active namespace stays visible so the user keeps context.
    expect(screen.getByRole("menuitem", { name: /Default/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Family/ })).toBeNull();
    // Expanding reveals the rest; collapsing hides them again.
    const heading = screen.getByRole("button", { name: "Namespace" });
    fireEvent.click(heading);
    expect(screen.getByRole("menuitem", { name: /Family/ })).toBeTruthy();
    fireEvent.click(heading);
    expect(screen.queryByRole("menuitem", { name: /Family/ })).toBeNull();
  });

  it("removes a checklist from its swipe-revealed trash (single tap)", () => {
    const removeChecklist = vi.fn();
    renderMenu({
      nav: { open: true },
      checklist: {
        checklists: [
          { id: "c1", name: "Groceries", remaining: 0 },
          { id: "c2", name: "Packing", remaining: 0 },
        ],
        activeChecklistId: "c1",
        removeChecklist,
      },
    });
    // Two lists → each gets a trash action; remove the second.
    const trash = screen.getAllByRole("button", { name: "Delete checklist" });
    expect(trash).toHaveLength(2);
    fireEvent.click(trash[1]!);
    expect(removeChecklist).toHaveBeenCalledWith("c2");
  });

  it("never exposes a trash action for the last remaining checklist", () => {
    renderMenu({
      nav: { open: true },
      checklist: {
        checklists: [{ id: "c1", name: "Groceries", remaining: 0 }],
        activeChecklistId: "c1",
      },
    });
    expect(
      screen.queryByRole("button", { name: "Delete checklist" }),
    ).toBeNull();
  });

  it("requires a second confirming tap to remove a namespace", () => {
    const onRemoveNamespace = vi.fn(async () => {});
    renderMenu({
      nav: { open: true },
      props: {
        onRemoveNamespace,
        namespaces: [
          { slug: "default", name: "Default" },
          { slug: "family", name: "Family" },
        ],
        activeNamespace: "default",
      },
    });
    // Expand the folded namespace list to reach the inactive "Family" row.
    fireEvent.click(screen.getByRole("button", { name: "Namespace" }));
    // The default namespace is not removable, only "Family".
    const trash = screen.getByRole("button", { name: "Delete namespace" });
    // First tap arms the confirm step; nothing is removed yet.
    fireEvent.click(trash);
    expect(onRemoveNamespace).not.toHaveBeenCalled();
    // The button now reads the confirm label; the second tap commits.
    const confirm = screen.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    expect(onRemoveNamespace).toHaveBeenCalledWith("family");
  });

  it("never exposes a trash action for the default namespace", () => {
    renderMenu({
      nav: { open: true },
      props: {
        namespaces: [{ slug: "default", name: "Default" }],
        activeNamespace: "default",
      },
    });
    expect(
      screen.queryByRole("button", { name: "Delete namespace" }),
    ).toBeNull();
  });

  it("opens namespace management from the Namespace heading's cog button", () => {
    renderMenu({ nav: { open: true } });
    fireEvent.click(screen.getByRole("button", { name: "Manage namespaces" }));
    expect(screen.getByTestId("open-modal").textContent).toBe("namespaces");
  });

  it("opens settings from the footer and changelog from the About menu", () => {
    const close = vi.fn();
    renderMenu({ nav: { open: true, close } });
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(screen.getByTestId("open-modal").textContent).toBe("settings");
    expect(close).toHaveBeenCalledTimes(1);
    // "What's new" now lives behind the About dropdown.
    expect(screen.queryByRole("menuitem", { name: "What's new" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "About" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "What's new" }));
    expect(screen.getByTestId("open-modal").textContent).toBe("changelog");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("hides the project links behind the About dropdown, settings last", () => {
    renderMenu({ nav: { open: true } });
    // Settings sits at the very foot of the footer; the project links are
    // folded away until About is opened.
    const labels = screen
      .getAllByRole("menuitem")
      .map((el) => el.textContent?.trim());
    expect(labels[labels.length - 1]).toContain("Settings");
    expect(
      screen.queryByRole("menuitem", { name: "Privacy policy" }),
    ).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /View source/ })).toBeNull();
    // Opening About reveals them.
    fireEvent.click(screen.getByRole("menuitem", { name: "About" }));
    expect(
      screen.getByRole("menuitem", { name: "Privacy policy" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /View source/ })).toBeTruthy();
  });

  it("shows the build version as a subtitle under View source", () => {
    renderMenu({ nav: { open: true } });
    fireEvent.click(screen.getByRole("menuitem", { name: "About" }));
    const source = screen.getByRole("menuitem", { name: /View source/ });
    // build-env's __BUILD_LABEL__ resolves to the package version in the
    // test build, so the subtitle renders as a second line in the item.
    expect(source.textContent).toContain("View source");
    expect(source.textContent).not.toBe("View source");
  });

  it("slides the panel in from the resting edge", () => {
    const { rerenderWith } = renderMenu({ nav: { open: true } });
    expect(document.querySelector("nav.drawer-panel-left")).not.toBeNull();

    rerenderWith({ nav: { open: true, position: { side: "right", y: 0.5 } } });
    expect(document.querySelector("nav.drawer-panel-right")).not.toBeNull();
  });

  it("docks as a permanent sidebar when pinned, with no button or backdrop", () => {
    renderMenu({ nav: { pinned: true } });
    // The panel is always present — no press needed.
    expect(screen.getByRole("menuitem", { name: /Archive/ })).toBeTruthy();
    // No floating toggle and no dismissable backdrop in the pinned layout.
    expect(screen.queryByLabelText("Open navigation")).toBeNull();
    expect(screen.queryByLabelText("Close navigation")).toBeNull();
    // The pinned panel is in normal flow, not a fixed sliding drawer.
    expect(document.querySelector("nav.drawer-panel-left")).toBeNull();
    expect(document.querySelector("nav.drawer-panel-right")).toBeNull();
  });

  it("docks the pinned sidebar on the resting edge", () => {
    const { rerenderWith } = renderMenu({
      nav: { pinned: true, position: { side: "left", y: 0.5 } },
    });
    // Left edge: border faces the content on the right, no order shuffle.
    expect(document.querySelector("nav.border-r")).not.toBeNull();
    expect(document.querySelector("nav.order-last")).toBeNull();

    rerenderWith({
      nav: { pinned: true, position: { side: "right", y: 0.5 } },
    });
    // Right edge: border on the left and ordered after the content.
    expect(document.querySelector("nav.border-l")).not.toBeNull();
    expect(document.querySelector("nav.order-last")).not.toBeNull();
  });

  it("closes on a backdrop click", () => {
    const close = vi.fn();
    renderMenu({ nav: { open: true, close } });
    // Two elements carry the close label (the toggle while open, and the
    // backdrop); clicking the backdrop fires close.
    const closers = screen.getAllByLabelText("Close navigation");
    fireEvent.click(closers[closers.length - 1]!);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("persists a new edge after a drag and swallows the trailing click", () => {
    const setPosition = vi.fn();
    const toggle = vi.fn();
    renderMenu({ nav: { toggle, setPosition } });
    const btn = screen.getByLabelText("Open navigation");
    // Drag the button across the midline to the right edge.
    pointer(btn, "pointerdown", { x: 12, y: 400 });
    pointer(btn, "pointermove", { x: 900, y: 400 });
    pointer(btn, "pointerup", { x: 900, y: 400 });
    expect(setPosition).toHaveBeenCalledTimes(1);
    expect(setPosition.mock.calls[0]![0].side).toBe("right");
    // The click that tails the drag must not toggle the drawer.
    fireEvent.click(btn);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("reports the drag lifecycle so the parent can gate pull-to-refresh", () => {
    const setDragging = vi.fn();
    renderMenu({ nav: { setDragging } });
    const btn = screen.getByLabelText("Open navigation");
    // Mounts resting — reports not-dragging.
    expect(setDragging).toHaveBeenLastCalledWith(false);

    pointer(btn, "pointerdown", { x: 12, y: 400 });
    pointer(btn, "pointermove", { x: 900, y: 400 });
    expect(setDragging).toHaveBeenLastCalledWith(true);

    pointer(btn, "pointerup", { x: 900, y: 400 });
    expect(setDragging).toHaveBeenLastCalledWith(false);
  });

  it("treats a press without movement as a tap that toggles", () => {
    const setPosition = vi.fn();
    const toggle = vi.fn();
    renderMenu({ nav: { toggle, setPosition } });
    const btn = screen.getByLabelText("Open navigation");
    pointer(btn, "pointerdown", { x: 12, y: 400 });
    pointer(btn, "pointerup", { x: 12, y: 400 });
    fireEvent.click(btn);
    expect(setPosition).not.toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  // Regression: with a visual-viewport offset present (the iOS keyboard
  // case), the button must follow the finger 1:1 from where it rests, not
  // jump by the offset the instant the drag starts. The drag is a delta
  // from the press point added to the rendered top, so a 50px finger move
  // is a 50px button move regardless of the offset.
  it("tracks the finger 1:1 when the visual viewport is offset", () => {
    const vv = {
      width: 1024,
      height: 500,
      offsetLeft: 0,
      offsetTop: 100,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
    Object.defineProperty(window, "visualViewport", {
      value: vv,
      configurable: true,
    });
    try {
      renderMenu({ nav: { position: { side: "left", y: 0.5 } } });
      const btn = screen.getByLabelText("Open navigation");
      // Resting top within the 500px-tall visible box, shifted by offsetTop:
      // 100 + 12 + 0.5 * (500 - 2*12 - 44) = 328.
      const restTop = Number.parseFloat(btn.style.top);
      expect(restTop).toBe(328);

      pointer(btn, "pointerdown", { x: 12, y: restTop });
      pointer(btn, "pointermove", { x: 12, y: restTop + 50 });
      // 50px down from rest, not snapped to the top of the box.
      expect(Number.parseFloat(btn.style.top)).toBe(restTop + 50);
    } finally {
      if (original) {
        Object.defineProperty(window, "visualViewport", original);
      } else {
        // jsdom has no visualViewport by default — remove the stub.
        delete (window as unknown as { visualViewport?: unknown })
          .visualViewport;
      }
    }
  });

  describe("folders", () => {
    const foldered: Partial<ChecklistContextValue> = {
      folders: [{ id: "f1", name: "Work", count: 1 }],
      checklists: [
        { id: "c1", name: "Filed list", remaining: 0, folderId: "f1" },
        { id: "c2", name: "Loose list", remaining: 0 },
      ],
      activeChecklistId: "c1",
    };

    it("renders a folder group with its filed lists nested inside", () => {
      renderMenu({ nav: { open: true }, checklist: foldered });
      // Folder header (collapse toggle) carries the name and its count badge.
      const header = screen.getByRole("button", { name: /Work/ });
      expect(header.getAttribute("aria-expanded")).toBe("true");
      expect(header.textContent).toContain("1");
      // Both the filed and the ungrouped list render.
      expect(screen.getByRole("menuitem", { name: /Filed list/ })).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: /Loose list/ })).toBeTruthy();
    });

    it("collapses a folder but keeps the active list peeking out", () => {
      renderMenu({
        nav: { open: true },
        checklist: {
          folders: [{ id: "f1", name: "Work", count: 2 }],
          checklists: [
            { id: "c1", name: "Filed active", remaining: 0, folderId: "f1" },
            { id: "c3", name: "Filed idle", remaining: 0, folderId: "f1" },
            { id: "c2", name: "Loose list", remaining: 0 },
          ],
          activeChecklistId: "c1",
        },
      });
      const header = screen.getByRole("button", { name: /Work/ });
      fireEvent.click(header);
      expect(header.getAttribute("aria-expanded")).toBe("false");
      // The idle filed list drops out of the tree…
      expect(screen.queryByRole("menuitem", { name: /Filed idle/ })).toBeNull();
      // …but the active one keeps peeking out, the way the active namespace
      // stays visible under a folded namespace section.
      expect(
        screen.getByRole("menuitem", { name: /Filed active/ }),
      ).toBeTruthy();
      // The ungrouped list is unaffected.
      expect(screen.getByRole("menuitem", { name: /Loose list/ })).toBeTruthy();
    });

    it("collapses a folder fully when its active list is elsewhere", () => {
      renderMenu({
        nav: { open: true },
        checklist: {
          folders: [{ id: "f1", name: "Work", count: 1 }],
          checklists: [
            { id: "c1", name: "Filed list", remaining: 0, folderId: "f1" },
            { id: "c2", name: "Loose active", remaining: 0 },
          ],
          activeChecklistId: "c2",
        },
      });
      fireEvent.click(screen.getByRole("button", { name: /Work/ }));
      // No list in the folder is active, so nothing peeks out.
      expect(screen.queryByRole("menuitem", { name: /Filed list/ })).toBeNull();
    });

    it("creates a folder via the action bar's New folder button", () => {
      const createFolder = vi.fn();
      renderMenu({ nav: { open: true }, checklist: { createFolder } });
      fireEvent.click(screen.getByRole("menuitem", { name: "New folder" }));
      // The inline name input appears; typing + Enter commits.
      const input = screen.getByPlaceholderText("Folder name");
      fireEvent.change(input, { target: { value: "Recipes" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(createFolder).toHaveBeenCalledWith("Recipes");
    });

    it("adds a list straight into a folder from its header +", () => {
      const addChecklistInFolder = vi.fn();
      renderMenu({
        nav: { open: true },
        checklist: { ...foldered, addChecklistInFolder },
      });
      fireEvent.click(screen.getByRole("button", { name: "New checklist" }));
      expect(addChecklistInFolder).toHaveBeenCalledWith("f1");
    });
  });

  describe("footer collapse rail", () => {
    // The collapsed flag is a module-scoped device-local singleton; reset it
    // around each case so it never leaks into the other suites.
    beforeEach(() => {
      localStorage.clear();
      setFooterCollapsed(false);
    });
    afterEach(() => {
      setFooterCollapsed(false);
      localStorage.clear();
    });

    it("shows the footer and a Collapse rail by default", () => {
      renderMenu({ nav: { open: true } });
      expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Collapse footer" }),
      ).toBeTruthy();
    });

    it("folds the footer away when the rail is pressed", () => {
      renderMenu({ nav: { open: true } });
      fireEvent.click(screen.getByRole("button", { name: "Collapse footer" }));
      // The footer rows drop out of the tree, freeing the space for the list.
      expect(screen.queryByRole("menuitem", { name: "Settings" })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: "About" })).toBeNull();
      // The rail now offers to bring the footer back.
      expect(
        screen.getByRole("button", { name: "Expand footer" }),
      ).toBeTruthy();
    });

    it("restores the footer when the rail is pressed again", () => {
      renderMenu({ nav: { open: true } });
      fireEvent.click(screen.getByRole("button", { name: "Collapse footer" }));
      fireEvent.click(screen.getByRole("button", { name: "Expand footer" }));
      expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
    });

    it("keeps the choice collapsed across a remount (device-local)", () => {
      const first = renderMenu({ nav: { open: true } });
      fireEvent.click(screen.getByRole("button", { name: "Collapse footer" }));
      first.unmount();
      // A freshly mounted drawer reads the persisted flag and stays folded.
      renderMenu({ nav: { open: true } });
      expect(screen.queryByRole("menuitem", { name: "Settings" })).toBeNull();
      expect(
        screen.getByRole("button", { name: "Expand footer" }),
      ).toBeTruthy();
    });

    it("collapses in the pinned sidebar layout too", () => {
      renderMenu({ nav: { pinned: true } });
      expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Collapse footer" }));
      expect(screen.queryByRole("menuitem", { name: "Settings" })).toBeNull();
    });

    // The panel reserves a bottom safe-area inset so its last child clears the
    // home indicator, but the content grows past that padding to reclaim the
    // inset for the scrolling list — so the footer / rail sit snug at the foot
    // of the drawer instead of floating above dead space. The footer then
    // carries its own inset-free bottom breathing room.
    it("reclaims the reserved bottom inset for the list, footer sits snug", () => {
      const { container } = renderMenu({ nav: { open: true } });
      const nav = container.querySelector("nav");
      expect(nav?.className).toContain(
        "padding-bottom:max(env(safe-area-inset-bottom)",
      );
      // The content wrapper grows past the panel's content box by the same
      // reserved amount, handing that space to the list rather than the foot.
      expect(
        nav?.querySelector(
          '[class*="height:calc(100%+max(env(safe-area-inset-bottom)"]',
        ),
      ).toBeTruthy();
      // The footer block owns its own (inset-free) bottom breathing room.
      const footer = screen
        .getByRole("menuitem", { name: "Settings" })
        .closest('[class*="padding-bottom:calc(1.25rem"]');
      expect(footer).toBeTruthy();
    });

    // Fullscreen PWA: with no bottom safe-area inset lifting the panel, the
    // last footer row (Settings) would sit on the screen edge, so its
    // breathing room carries an extra 10px to stay a comfortable thumb reach.
    it("adds extra thumb clearance below the fullscreen footer", () => {
      renderMenu({ nav: { open: true } });
      const footer = screen
        .getByRole("menuitem", { name: "Settings" })
        .closest('[class*="padding-bottom:calc(1.25rem"]');
      expect(footer?.className).toContain(
        "padding-bottom:calc(1.25rem_-_var(--density-row-py)_+_10px)",
      );
    });
  });

  describe("drag drop targets", () => {
    const foldered: Partial<ChecklistContextValue> = {
      folders: [{ id: "f1", name: "Work", count: 1 }],
      checklists: [
        { id: "c1", name: "Filed list", remaining: 0, folderId: "f1" },
        { id: "c2", name: "Loose list", remaining: 0 },
      ],
      activeChecklistId: "c1",
    };

    it("marks folders, the ungrouped zone, and Archive as drop targets", () => {
      const { container } = renderMenu({
        nav: { open: true },
        checklist: foldered,
      });
      // The folder, the root zone, and the Archive button each advertise a
      // `data-checklist-drop` key so the touch drag layer can hit-test them.
      expect(
        container.querySelector('[data-checklist-drop="f1"]'),
      ).toBeTruthy();
      expect(
        container.querySelector('[data-checklist-drop="__root__"]'),
      ).toBeTruthy();
      expect(
        container.querySelector('[data-checklist-drop="__archive__"]'),
      ).toBeTruthy();
    });

    it("makes every namespace but the active one a drop target", () => {
      const { container } = renderMenu({
        nav: { open: true },
        props: {
          namespaces: [
            { slug: "default", name: "Default" },
            { slug: "work", name: "Work" },
          ],
          activeNamespace: "default",
        },
      });
      // Expand the namespace list so the inactive "Work" row (a drop target)
      // is rendered.
      fireEvent.click(screen.getByRole("button", { name: "Namespace" }));
      // The inactive namespace accepts a dropped list; the active one doesn't.
      expect(
        container.querySelector('[data-checklist-drop="ns:work"]'),
      ).toBeTruthy();
      expect(
        container.querySelector('[data-checklist-drop="ns:default"]'),
      ).toBeNull();
    });
  });
});
