// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ArchiveView } from "../../src/ui/ArchiveView.tsx";
import type { ChecklistItem } from "../../src/domain/types.ts";

const items: ChecklistItem[] = [
  { id: "i1", title: "Old milk", checked: true, archived: true },
  { id: "i2", title: "Stale bread", checked: false, archived: true },
];

function noop(): void {}

function renderView(props: Partial<React.ComponentProps<typeof ArchiveView>>) {
  return render(
    <ArchiveView items={items} onRestore={noop} onRemove={noop} {...props} />,
  );
}

describe("ArchiveView", () => {
  it("lists archived items with the count", () => {
    renderView({});
    expect(screen.getByText("Old milk")).toBeTruthy();
    expect(screen.getByText("Stale bread")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows an empty state when nothing is archived", () => {
    renderView({ items: [] });
    expect(screen.getByText(/nothing archived/i)).toBeTruthy();
  });

  it("restores an item through its restore button", () => {
    const onRestore = vi.fn();
    renderView({ onRestore });
    fireEvent.click(screen.getAllByLabelText("Restore item")[0]!);
    expect(onRestore).toHaveBeenCalledWith("i1");
  });

  it("deletes an item through its delete button", () => {
    const onRemove = vi.fn();
    renderView({ onRemove });
    fireEvent.click(screen.getAllByLabelText("Delete")[0]!);
    expect(onRemove).toHaveBeenCalledWith("i1");
  });
});
