// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

import type { ArchivedGroup } from "../../src/domain/checklists.ts";
import type { TransformRule } from "../../src/domain/transforms.ts";
import type { ChecklistItem } from "../../src/domain/types.ts";
import { ArchivedDrawer } from "../../src/ui/ArchivedDrawer.tsx";
import { ArchiveView } from "../../src/ui/ArchiveView.tsx";
import { ChecklistRow } from "../../src/ui/ChecklistRow.tsx";
import type { DragHandleProps } from "../../src/ui/hooks/useListReorder.ts";
import { renderWithChecklist } from "./context-harness.tsx";

// A row rendered under the user's display transforms: the title and the note
// read differently, but the item itself is untouched — pressing the row still
// opens the editor on the raw text.

const noop = (): void => {};
const dragHandleProps: DragHandleProps = { onPointerDown: noop };

function rule(over: Partial<TransformRule> = {}): TransformRule {
  return {
    id: "r1",
    pattern: "#(\\d+)",
    caseInsensitive: false,
    kind: "link",
    replacement: "https://example.com/issues/$1",
    label: "",
    mask: "edges",
    enabled: true,
    ...over,
  };
}

function renderRow(
  item: ChecklistItem,
  transforms: TransformRule[],
  over: Partial<Parameters<typeof ChecklistRow>[0]> = {},
) {
  return render(
    <ul>
      <ChecklistRow
        item={item}
        onToggle={noop}
        onArchive={noop}
        onDelete={noop}
        onEdit={noop}
        transforms={transforms}
        dragHandleProps={dragHandleProps}
        dragging={false}
        {...over}
      />
    </ul>,
  );
}

const plain: ChecklistItem = {
  id: "i1",
  title: "Fix #134",
  checked: false,
  archived: false,
};

afterEach(cleanup);

describe("checklist row — display transforms", () => {
  it("renders a matched reference in the title as a link", () => {
    renderRow(plain, [rule()]);
    const link = screen.getByRole("link", { name: "#134" });
    expect(link.getAttribute("href")).toBe("https://example.com/issues/134");
  });

  it("keeps the title a plain button when no rule matches", () => {
    renderRow({ ...plain, title: "Buy milk" }, [rule()]);
    expect(
      screen.getByRole("button", { name: /Buy milk|Edit item/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("masks a sensitive title without changing the stored text", () => {
    const onEdit = vi.fn();
    renderRow(
      { ...plain, title: "Door 0761234123" },
      [rule({ pattern: "\\d{10}", kind: "sensitive" })],
      { onEdit },
    );
    expect(screen.getByText("076****123")).toBeTruthy();
    // Opening the editor shows the real value back.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    const input = screen.getByDisplayValue("Door 0761234123");
    expect(input).toBeTruthy();
  });

  it("opens the editor on the raw title when the transformed title is pressed", () => {
    renderRow(plain, [rule()]);
    // The title is a press-to-edit surface (not a <button>) once it holds a
    // link, so the link inside it stays followable.
    fireEvent.click(screen.getByRole("button", { name: "Edit item" }));
    expect(screen.getByDisplayValue("Fix #134")).toBeTruthy();
  });

  it("transforms the rendered note but not the note editor", () => {
    const item: ChecklistItem = { ...plain, title: "Ticket", notes: "See #99" };
    renderRow(item, [rule()]);
    // Reveal the body, then read the link out of it.
    fireEvent.click(screen.getByRole("button", { name: "Show note" }));
    const link = screen.getByRole("link", { name: "#99" });
    expect(link.getAttribute("href")).toBe("https://example.com/issues/99");
  });
});

describe("archive surfaces — display transforms", () => {
  const secret: ChecklistItem = {
    id: "i9",
    title: "Door 0761234123",
    checked: false,
    archived: true,
  };
  const mask = rule({ pattern: "\\d{10}", kind: "sensitive" });

  it("keeps an archived item masked in the archive view", () => {
    const groups: ArchivedGroup[] = [
      { id: "l1", name: "Home", items: [secret] },
    ];
    renderWithChecklist(<ArchiveView />, {
      archivedGroups: groups,
      transforms: [mask],
    });
    expect(screen.getByText(/076\*\*\*\*123/)).toBeTruthy();
    expect(screen.queryByText(/0761234123/)).toBeNull();
  });

  it("keeps an archived item masked in the archive drawer", () => {
    render(
      <ArchivedDrawer
        open
        onClose={noop}
        listName="Home"
        items={[secret]}
        onRestore={noop}
        onDelete={noop}
        transforms={[mask]}
      />,
    );
    expect(screen.getByText(/076\*\*\*\*123/)).toBeTruthy();
    expect(screen.queryByText(/0761234123/)).toBeNull();
  });
});
