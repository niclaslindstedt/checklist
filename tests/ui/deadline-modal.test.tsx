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
    const date = screen.getByLabelText("Due date") as HTMLInputElement;
    expect(date.value).toBe("2026-08-01");
    fireEvent.change(date, { target: { value: "2026-09-01" } });
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
});
