// @vitest-environment jsdom
//
// FolderRow renders two different action affordances depending on the pointer
// type: a right-click Rename / Delete context menu on desktop, and a
// swipe-revealed Edit / Delete strip on touch. The two are now separate
// components (`FolderRowDesktop` / `FolderRowTouch`) dispatched by the
// `desktop` flag, so the swipe hook never mounts on the desktop path. These
// exercise each branch directly — the desktop context menu in particular has
// no coverage through `SideMenu`, which renders touch-only under jsdom (no
// `matchMedia`).
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FolderRow } from "../../src/ui/SideMenuRows.tsx";
import type { ContextMenuItem } from "../../src/ui/hooks/useContextMenu.ts";

afterEach(cleanup);

function noop(): void {}

type FolderRowProps = React.ComponentProps<typeof FolderRow>;

function renderRow(overrides: Partial<FolderRowProps> = {}) {
  const props: FolderRowProps = {
    name: "Work",
    count: 2,
    expanded: false,
    desktop: false,
    isDropTarget: false,
    renameLabel: "Rename folder",
    deleteLabel: "Delete folder",
    addLabel: "New checklist",
    onToggle: noop,
    onRename: noop,
    onDelete: noop,
    onAdd: noop,
    onDragOver: noop,
    onDragLeave: noop,
    onDrop: noop,
    openMenu: noop,
    ...overrides,
  };
  return render(<FolderRow {...props} />);
}

describe("FolderRow header (shared)", () => {
  it("renders the name and count and toggles on the header click", () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });
    const header = screen.getByRole("button", { name: /Work/ });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(header.textContent).toContain("2");
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("hides the count badge when the folder is empty", () => {
    renderRow({ count: 0 });
    const header = screen.getByRole("button", { name: /Work/ });
    expect(header.textContent).not.toContain("0");
  });

  it("starts a list inside the folder from the trailing +", () => {
    const onAdd = vi.fn();
    renderRow({ onAdd });
    fireEvent.click(screen.getByRole("button", { name: "New checklist" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});

describe("FolderRow desktop", () => {
  it("opens a Rename / Delete context menu on right-click", () => {
    const openMenu = vi.fn();
    renderRow({ desktop: true, openMenu });
    fireEvent.contextMenu(screen.getByRole("button", { name: /Work/ }));
    expect(openMenu).toHaveBeenCalledOnce();
    const items = openMenu.mock.calls[0]![0] as ContextMenuItem[];
    expect(items.map((i) => i.label)).toEqual([
      "Rename folder",
      "Delete folder",
    ]);
  });

  it("wires the menu actions to onRename / onDelete", () => {
    const openMenu = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    renderRow({ desktop: true, openMenu, onRename, onDelete });
    fireEvent.contextMenu(screen.getByRole("button", { name: /Work/ }));
    const items = openMenu.mock.calls[0]![0] as ContextMenuItem[];
    expect(items).toHaveLength(2);
    items[0]!.onSelect();
    items[1]!.onSelect();
    expect(onRename).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    // The delete entry is flagged dangerous so it renders in the danger style.
    expect(items[1]!.danger).toBe(true);
  });

  it("does not render the touch swipe action strip", () => {
    renderRow({ desktop: true });
    // `hidden: true` so this proves genuine absence, not just an aria-hidden
    // resting strip.
    expect(
      screen.queryByRole("button", { name: "Rename folder", hidden: true }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete folder", hidden: true }),
    ).toBeNull();
  });
});

describe("FolderRow touch", () => {
  it("reveals Edit / Delete buttons wired to onRename / onDelete", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    renderRow({ desktop: false, onRename, onDelete });
    // The strip is `aria-hidden` until a swipe latches it open, so query it
    // with `hidden: true`; we're asserting the resting strip's wiring.
    fireEvent.click(
      screen.getByRole("button", { name: "Rename folder", hidden: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete folder", hidden: true }),
    );
    expect(onRename).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("never opens a context menu (no openMenu on touch)", () => {
    const openMenu = vi.fn();
    renderRow({ desktop: false, openMenu });
    fireEvent.contextMenu(screen.getByRole("button", { name: /Work/ }));
    expect(openMenu).not.toHaveBeenCalled();
  });
});
