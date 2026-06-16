// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SideMenu } from "../../src/ui/SideMenu.tsx";

function noop(): void {}

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

function renderMenu(props: Partial<React.ComponentProps<typeof SideMenu>>) {
  return render(
    <SideMenu
      open={false}
      onToggle={noop}
      onClose={noop}
      current="checklist"
      onNavigate={noop}
      archivedCount={0}
      onUndo={noop}
      onRedo={noop}
      canUndo={false}
      canRedo={false}
      onOpenSettings={noop}
      onOpenChangelog={noop}
      {...props}
    />,
  );
}

describe("SideMenu", () => {
  it("keeps the drawer collapsed until the floating button is pressed", () => {
    const onToggle = vi.fn();
    renderMenu({ onToggle });
    // The nav entries aren't in the tree while collapsed.
    expect(screen.queryByRole("menuitem", { name: "Archive" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Open navigation"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("lists both views and navigates when one is chosen", () => {
    const onNavigate = vi.fn();
    renderMenu({ open: true, onNavigate });
    expect(screen.getByRole("menuitem", { name: /Checklist/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: /Archive/ }));
    expect(onNavigate).toHaveBeenCalledWith("archive");
  });

  it("marks the current view as the active page", () => {
    renderMenu({ open: true, current: "archive" });
    const archive = screen.getByRole("menuitem", { name: /Archive/ });
    expect(archive.getAttribute("aria-current")).toBe("page");
  });

  it("shows the archived count as a badge when there are archived items", () => {
    renderMenu({ open: true, archivedCount: 3 });
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("invokes undo / redo and disables them when there's no history", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    renderMenu({ open: true, onUndo, onRedo, canUndo: true, canRedo: false });
    const undo = screen.getByRole("menuitem", { name: "Undo" });
    const redo = screen.getByRole("menuitem", { name: "Redo" });
    expect((redo as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(redo);
    expect(onRedo).not.toHaveBeenCalled();
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("opens settings and changelog from the relocated footer menu", () => {
    const onOpenSettings = vi.fn();
    const onOpenChangelog = vi.fn();
    const onClose = vi.fn();
    renderMenu({ open: true, onOpenSettings, onOpenChangelog, onClose });
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "What's new" }));
    expect(onOpenChangelog).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("exposes the project links and reads bottom-up (settings last)", () => {
    renderMenu({ open: true });
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

  it("closes on a backdrop click", () => {
    const onClose = vi.fn();
    renderMenu({ open: true, onClose });
    // Two elements carry the close label (the toggle while open, and the
    // backdrop); clicking the backdrop fires onClose.
    const closers = screen.getAllByLabelText("Close navigation");
    fireEvent.click(closers[closers.length - 1]!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("persists a new edge after a drag and swallows the trailing click", () => {
    const onPositionChange = vi.fn();
    const onToggle = vi.fn();
    renderMenu({ onToggle, onPositionChange });
    const btn = screen.getByLabelText("Open navigation");
    // Drag the button across the midline to the right edge.
    pointer(btn, "pointerdown", { x: 12, y: 400 });
    pointer(btn, "pointermove", { x: 900, y: 400 });
    pointer(btn, "pointerup", { x: 900, y: 400 });
    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange.mock.calls[0]![0].side).toBe("right");
    // The click that tails the drag must not toggle the drawer.
    fireEvent.click(btn);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("treats a press without movement as a tap that toggles", () => {
    const onPositionChange = vi.fn();
    const onToggle = vi.fn();
    renderMenu({ onToggle, onPositionChange });
    const btn = screen.getByLabelText("Open navigation");
    pointer(btn, "pointerdown", { x: 12, y: 400 });
    pointer(btn, "pointerup", { x: 12, y: 400 });
    fireEvent.click(btn);
    expect(onPositionChange).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
