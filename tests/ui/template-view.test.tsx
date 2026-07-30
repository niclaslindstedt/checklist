// @vitest-environment jsdom
//
// The checklist view rendering a *template* rather than a live list. A template
// mirrors a checklist's data model, so the same view serves both — these cover
// the handful of places where it deliberately differs: the boxes are inert, the
// progress / archive / bulk-finish affordances stand down, and the banner
// carries the action the screen exists for.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

import { ChecklistView } from "../../src/ui/ChecklistView.tsx";
import type { ChecklistContextValue } from "../../src/ui/checklist-context.ts";
import type { ChecklistItem, Template } from "../../src/domain/types.ts";
import { renderWithChecklist } from "./context-harness.tsx";

const NOW = "2026-01-01T00:00:00.000Z";

const items: ChecklistItem[] = [
  { id: "i1", title: "Passport", checked: false },
  { id: "i2", title: "Charger", checked: false },
];

const template: Template = {
  version: 1,
  id: "tpl-1",
  name: "Weekend trip",
  items,
  createdAt: NOW,
  updatedAt: NOW,
};

function renderTemplate(value: Partial<ChecklistContextValue> = {}) {
  return renderWithChecklist(<ChecklistView />, {
    items,
    openList: template,
    activeTemplate: template,
    templateMode: true,
    ...value,
  });
}

describe("ChecklistView in template mode", () => {
  it("shows the template's name as the header title", () => {
    renderTemplate();
    expect(screen.getByRole("button", { name: "Weekend trip" })).toBeTruthy();
  });

  it("renders every checkbox but leaves them disabled", () => {
    renderTemplate();
    const boxes = screen.getAllByRole("checkbox", {
      name: "Template item (not checkable)",
    }) as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box.disabled).toBe(true);
  });

  it("never toggles an item, even if a click reaches the box", () => {
    const toggle = vi.fn();
    renderTemplate({ toggle });
    const [box] = screen.getAllByRole("checkbox", {
      name: "Template item (not checkable)",
    });
    fireEvent.click(box!);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("hides the progress count — a template has nothing to complete", () => {
    renderTemplate({ showItemCount: true, checkedCount: 0, visibleCount: 2 });
    expect(screen.queryByLabelText(/items checked/)).toBeNull();
  });

  it("explains why the boxes are inert", () => {
    renderTemplate();
    expect(
      screen.getByText("Template — items aren’t checked off here"),
    ).toBeTruthy();
  });

  it("stamps a new list out of the template from the banner action", () => {
    const createChecklistFromTemplate = vi.fn();
    renderTemplate({ createChecklistFromTemplate });
    fireEvent.click(screen.getByRole("button", { name: "New list from this" }));
    expect(createChecklistFromTemplate).toHaveBeenCalledWith("tpl-1");
  });

  it("renames the template — not the checklist underneath it", () => {
    const renameTemplate = vi.fn();
    const renameChecklist = vi.fn();
    renderTemplate({ renameTemplate, renameChecklist });
    fireEvent.click(screen.getByRole("button", { name: "Weekend trip" }));
    const input = screen.getByLabelText("Rename checklist");
    fireEvent.change(input, { target: { value: "Packing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(renameTemplate).toHaveBeenCalledWith("tpl-1", "Packing");
    expect(renameChecklist).not.toHaveBeenCalled();
  });

  it("keeps the composer, so a template is still edited like a list", () => {
    renderTemplate();
    expect(screen.getByRole("button", { name: "Add item" })).toBeTruthy();
  });
});

describe("ChecklistView on a real list", () => {
  it("keeps the checkboxes operable and the banner absent", () => {
    const toggle = vi.fn();
    renderWithChecklist(<ChecklistView />, { items, toggle });
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes[0]!.disabled).toBe(false);
    fireEvent.click(boxes[0]!);
    expect(toggle).toHaveBeenCalledWith("i1");
    expect(screen.queryByRole("button", { name: "New list from this" })).toBe(
      null,
    );
  });
});
