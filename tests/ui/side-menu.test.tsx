// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SideMenu } from "../../src/ui/SideMenu.tsx";

function noop(): void {}

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
});
