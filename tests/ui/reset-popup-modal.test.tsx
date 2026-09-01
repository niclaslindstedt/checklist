// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

import { createChecklist } from "../../src/domain/checklists.ts";
import type { Checklist, ChecklistItem } from "../../src/domain/types.ts";
import { ResetPopupModal } from "../../src/ui/ResetPopupModal.tsx";

const noop = (): void => {};
const NOW = "2026-06-01T08:05:00.000Z";

function item(over: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return { title: over.id, checked: false, ...over };
}

const items: ChecklistItem[] = [
  item({ id: "Keys" }),
  item({
    id: "Bag",
    category: true,
    children: [item({ id: "Laptop" }), item({ id: "Charger", checked: true })],
  }),
  item({ id: "Later", notBefore: "2099-01-01" }),
];

const list: Checklist = {
  ...createChecklist("l1", "Leaving home", "2026-05-01T00:00:00.000Z"),
  items,
};

afterEach(cleanup);

describe("ResetPopupModal", () => {
  it("names the list and lists its items, sub-items nested", () => {
    render(
      <ResetPopupModal
        list={list}
        items={items}
        now={NOW}
        onToggle={noop}
        onOpen={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Leaving home" })).toBeTruthy();
    expect(screen.getByText("This list was just reset.")).toBeTruthy();
    for (const title of ["Keys", "Bag", "Laptop", "Charger", "Later"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    // A sub-item's row is indented past its parent's.
    const laptop = screen.getByText("Laptop").closest("li")!;
    const keys = screen.getByText("Keys").closest("li")!;
    expect(laptop.style.paddingLeft).not.toBe(keys.style.paddingLeft);
  });

  it("ticks an item through the list-scoped toggle", () => {
    const onToggle = vi.fn();
    render(
      <ResetPopupModal
        list={list}
        items={items}
        now={NOW}
        onToggle={onToggle}
        onOpen={noop}
        onClose={noop}
      />,
    );
    const boxes = screen.getAllByRole("checkbox");
    // Keys is the first row and unchecked.
    fireEvent.click(boxes[0]!);
    expect(onToggle).toHaveBeenCalledWith("Keys");
  });

  it("keeps a held-back item's box inert", () => {
    const onToggle = vi.fn();
    render(
      <ResetPopupModal
        list={list}
        items={items}
        now={NOW}
        onToggle={onToggle}
        onOpen={noop}
        onClose={noop}
      />,
    );
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const held = boxes[boxes.length - 1]!;
    expect(held.disabled).toBe(true);
    fireEvent.click(held);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("closes from the X in the corner and jumps to the list from the footer", () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    render(
      <ResetPopupModal
        list={list}
        items={items}
        now={NOW}
        onToggle={noop}
        onOpen={onOpen}
        onClose={onClose}
      />,
    );
    // The header X and the backdrop both carry the close label; the X is
    // inside the dialog.
    const dialog = screen.getByRole("dialog");
    const x = dialog.querySelector('button[aria-label="Close"]')!;
    fireEvent.click(x);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Open list"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("says so when the list is empty", () => {
    render(
      <ResetPopupModal
        list={{ ...list, items: [] }}
        items={[]}
        now={NOW}
        onToggle={noop}
        onOpen={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText("Nothing on this list yet.")).toBeTruthy();
  });
});
