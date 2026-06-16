// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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
          { id: "c1", name: "Groceries" },
          { id: "c2", name: "Packing" },
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

  it("adds a checklist from the Checklists heading's add button", () => {
    const addChecklist = vi.fn();
    const navigate = vi.fn();
    renderMenu({
      nav: { open: true, navigate },
      checklist: { addChecklist },
    });
    fireEvent.click(screen.getByRole("button", { name: "New checklist" }));
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
      checklist: { archivedItems: archived(3) },
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
    fireEvent.click(screen.getByRole("menuitem", { name: /Family/ }));
    expect(onSwitchNamespace).toHaveBeenCalledWith("family");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("removes a checklist from its swipe-revealed trash (single tap)", () => {
    const removeChecklist = vi.fn();
    renderMenu({
      nav: { open: true },
      checklist: {
        checklists: [
          { id: "c1", name: "Groceries" },
          { id: "c2", name: "Packing" },
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
        checklists: [{ id: "c1", name: "Groceries" }],
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

  it("opens namespace management from the Namespace heading's add button", () => {
    renderMenu({ nav: { open: true } });
    fireEvent.click(screen.getByRole("button", { name: "New namespace" }));
    expect(screen.getByTestId("open-modal").textContent).toBe("namespaces");
  });

  it("opens settings and changelog from the relocated footer menu", () => {
    const close = vi.fn();
    renderMenu({ nav: { open: true, close } });
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(screen.getByTestId("open-modal").textContent).toBe("settings");
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "What's new" }));
    expect(screen.getByTestId("open-modal").textContent).toBe("changelog");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("exposes the project links and reads bottom-up (settings last)", () => {
    renderMenu({ nav: { open: true } });
    const labels = screen
      .getAllByRole("menuitem")
      .map((el) => el.textContent?.trim());
    // Settings sits at the very foot of the inverted footer, after the
    // links and changelog.
    expect(labels[labels.length - 1]).toContain("Settings");
    expect(
      screen.getByRole("menuitem", { name: "Privacy policy" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /View source/ })).toBeTruthy();
  });

  it("shows the build version as a subtitle under View source", () => {
    renderMenu({ nav: { open: true } });
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
});
