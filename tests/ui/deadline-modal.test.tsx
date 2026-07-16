// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ChecklistItem } from "../../src/domain/types.ts";
import { DeadlineModal } from "../../src/ui/DeadlineModal.tsx";

const noop = (): void => {};
const base: ChecklistItem = { id: "i1", title: "Task", checked: false };

afterEach(cleanup);

describe("DeadlineModal", () => {
  it("prefills the current due date and saves an edited one", () => {
    const onSubmit = vi.fn();
    render(
      <DeadlineModal
        item={{ ...base, deadline: "2026-08-01" }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Due date" });
    expect(trigger.textContent).toContain("1 Aug 2026");
    // Open the calendar, step to the next month, and pick a day there — the
    // native input this replaced could not survive that navigation on iOS.
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(
      screen.getByRole("button", { name: /\b1 September 2026$/ }),
    );
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith("2026-09-01", null);
  });

  it("preserves a preset recurrence when saving untouched", () => {
    const onSubmit = vi.fn();
    render(
      <DeadlineModal
        item={{
          ...base,
          deadline: "2026-08-01",
          recurrence: { unit: "week", interval: 2 },
        }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith("2026-08-01", {
      unit: "week",
      interval: 2,
    });
  });

  it("clears the deadline (and its recurrence)", () => {
    const onSubmit = vi.fn();
    render(
      <DeadlineModal
        item={{
          ...base,
          deadline: "2026-08-01",
          recurrence: { unit: "month", interval: 1 },
        }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByText("Clear deadline"));
    expect(onSubmit).toHaveBeenCalledWith(null, null);
  });

  it("saves nothing (a clear) when no date is set", () => {
    const onSubmit = vi.fn();
    render(<DeadlineModal item={base} onSubmit={onSubmit} onClose={noop} />);
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith(null, null);
  });

  it("lets the interval be retyped freely and saves the new value", () => {
    const onSubmit = vi.fn();
    render(
      <DeadlineModal
        item={{
          ...base,
          deadline: "2026-08-01",
          recurrence: { unit: "week", interval: 1 },
        }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    const field = screen.getByLabelText("Repeat interval") as HTMLInputElement;
    // A digit-only pad on mobile; not the punctuation-heavy number keyboard.
    expect(field.getAttribute("inputmode")).toBe("numeric");
    // Retype the interval — the string-backed field never wedges on the
    // controlled-number "03" bug.
    fireEvent.change(field, { target: { value: "3" } });
    expect(field.value).toBe("3");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith("2026-08-01", {
      unit: "week",
      interval: 3,
    });
  });

  it("normalises a cleared interval back to 1 on blur and rejects non-digits", () => {
    const onSubmit = vi.fn();
    render(
      <DeadlineModal
        item={{
          ...base,
          deadline: "2026-08-01",
          recurrence: { unit: "month", interval: 4 },
        }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    const field = screen.getByLabelText("Repeat interval") as HTMLInputElement;
    // Non-digit characters never make it into the field.
    fireEvent.change(field, { target: { value: "1a2" } });
    expect(field.value).toBe("12");
    // Clearing it leaves an empty field mid-edit, which blur repairs to 1.
    fireEvent.change(field, { target: { value: "" } });
    expect(field.value).toBe("");
    fireEvent.blur(field);
    expect(field.value).toBe("1");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith("2026-08-01", {
      unit: "month",
      interval: 1,
    });
  });
});
