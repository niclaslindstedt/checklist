// @vitest-environment jsdom
//
// FolderRow renders two different action affordances depending on the pointer
// type: a right-click Rename / Delete context menu on desktop, and a
// swipe-revealed Edit / Delete strip on touch. The variants
// (`FolderRowDesktop` / `FolderRowTouch`) are dispatched by the `desktop`
// flag, so the swipe hook never mounts on the desktop path. These exercise
// each branch directly — the desktop context menu in particular has no
// coverage through `SideMenu`, which renders touch-only under jsdom (no
// `matchMedia`). FolderEditRow's commit / cancel / latch rules are pinned
// here too.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FolderEditRow, FolderRow } from "../../src/ui/SideMenuFolderRow.tsx";
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

describe("FolderEditRow", () => {
  function renderEdit(
    overrides: Partial<React.ComponentProps<typeof FolderEditRow>> = {},
  ) {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <FolderEditRow
        placeholder="Folder name"
        onCommit={onCommit}
        onCancel={onCancel}
        {...overrides}
      />,
    );
    const input = screen.getByPlaceholderText<HTMLInputElement>("Folder name");
    return { input, onCommit, onCancel };
  }

  it("focuses the input on mount and seeds it with the initial name", () => {
    const { input } = renderEdit({ initial: "Work" });
    expect(input.value).toBe("Work");
    expect(document.activeElement).toBe(input);
  });

  it("commits the trimmed name on Enter", () => {
    const { input, onCommit, onCancel } = renderEdit();
    fireEvent.change(input, { target: { value: "  Recipes  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("Recipes");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("commits on blur with a non-empty name", () => {
    const { input, onCommit } = renderEdit();
    fireEvent.change(input, { target: { value: "Recipes" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("Recipes");
  });

  it("cancels on blur when the name is empty or whitespace", () => {
    const { input, onCommit, onCancel } = renderEdit();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("cancels on Escape without committing, even with a name typed", () => {
    const { input, onCommit, onCancel } = renderEdit();
    fireEvent.change(input, { target: { value: "Recipes" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
    // The committed latch also swallows the blur that follows the Escape.
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits only once when Enter is followed by the blur it causes", () => {
    const { input, onCommit } = renderEdit();
    fireEvent.change(input, { target: { value: "Recipes" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("Recipes");
  });
});
