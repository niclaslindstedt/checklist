// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

import type { ChecklistItem } from "../../src/domain/types.ts";
import { fireDomEvent } from "./fire-dom-event.ts";
import { TimingModal } from "../../src/ui/TimingModal.tsx";

const noop = (): void => {};
const base: ChecklistItem = { id: "i1", title: "Task", checked: false };

afterEach(cleanup);

describe("TimingModal", () => {
  it("prefills the current due date and saves an edited one", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
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
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: null,
      deadline: "2026-09-01",
      recurrence: null,
    });
  });

  it("preserves a preset recurrence when saving untouched", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
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
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: null,
      deadline: "2026-08-01",
      recurrence: { unit: "week", interval: 2 },
    });
  });

  it("prefills a not-before day and saves it alongside an untouched due date", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
        item={{ ...base, notBefore: "2026-08-01", deadline: "2026-08-20" }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Not before" });
    expect(trigger.textContent).toContain("1 Aug 2026");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: "2026-08-01",
      deadline: "2026-08-20",
      recurrence: null,
    });
  });

  it("saves an edited not-before day on its own, with no due date", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
        item={{ ...base, notBefore: "2026-08-01" }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not before" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(
      screen.getByRole("button", { name: /\b1 September 2026$/ }),
    );
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: "2026-09-01",
      deadline: null,
      recurrence: null,
    });
  });

  it("offers Clear timing for a gated item that has no due date", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
        item={{ ...base, notBefore: "2026-08-01" }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByText("Clear timing"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: null,
      deadline: null,
      recurrence: null,
    });
  });

  it("greys out due-date days that fall before the chosen gate", () => {
    render(
      <TimingModal
        item={{ ...base, notBefore: "2099-08-15" }}
        onSubmit={vi.fn()}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    // With no due date yet, a bounded picker seeds on the gate's own month
    // rather than today's — so both sides of the boundary are on screen
    // whatever day the suite runs on.
    const before = screen.getByRole("button", {
      name: /\b14 August 2099$/,
    }) as HTMLButtonElement;
    const onTheDay = screen.getByRole("button", {
      name: /\b15 August 2099$/,
    }) as HTMLButtonElement;
    // The gate day itself is selectable — `notBefore` is inclusive.
    expect(before.disabled).toBe(true);
    expect(onTheDay.disabled).toBe(false);
  });

  it("refuses a synthetic click on an out-of-range day", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
        item={{ ...base, notBefore: "2099-08-15" }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    // Preact dispatches to a disabled button's handler, so the guard inside
    // `pickDay` is what actually holds — saving carries no due date.
    fireEvent.click(screen.getByRole("button", { name: /\b14 August 2099$/ }));
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: "2099-08-15",
      deadline: null,
      recurrence: null,
    });
  });

  it("greys out whole months and years that end before the gate", () => {
    render(
      <TimingModal
        item={{ ...base, notBefore: "2099-08-15" }}
        onSubmit={vi.fn()}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose month" }));
    // July 2099 ends before the gate; August still holds selectable days.
    expect(
      (screen.getByRole("button", { name: "July" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "August" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Choose year" }));
    expect(
      (screen.getByRole("button", { name: "2098" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "2099" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("leaves the due-date picker unbounded when there is no gate", () => {
    render(<TimingModal item={base} onSubmit={vi.fn()} onClose={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    const days = screen
      .getAllByRole("button")
      .filter((b) => /\d{4}$/.test(b.getAttribute("aria-label") ?? ""));
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("drops a due date the gate has just overtaken", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
        item={{ ...base, notBefore: "2026-08-01", deadline: "2026-08-10" }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Due date" }).textContent,
    ).toContain("10 Aug");
    // Push the gate past the due date — the now-unreachable date is cleared
    // in front of the user rather than saved as an impossible pair.
    fireEvent.click(screen.getByRole("button", { name: "Not before" }));
    fireEvent.click(screen.getByRole("button", { name: /\b20 August 2026$/ }));
    expect(
      screen.getByRole("button", { name: "Due date" }).textContent,
    ).toContain("Pick a date");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: "2026-08-20",
      deadline: null,
      recurrence: null,
    });
  });

  it("keeps a due date the gate does not overtake", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
        item={{ ...base, notBefore: "2026-08-01", deadline: "2026-08-25" }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Not before" }));
    fireEvent.click(screen.getByRole("button", { name: /\b20 August 2026$/ }));
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: "2026-08-20",
      deadline: "2026-08-25",
      recurrence: null,
    });
  });

  it("clears the whole timing — both dates and the recurrence", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
        item={{
          ...base,
          deadline: "2026-08-01",
          recurrence: { unit: "month", interval: 1 },
        }}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.click(screen.getByText("Clear timing"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: null,
      deadline: null,
      recurrence: null,
    });
  });

  it("saves nothing (a clear) when no date is set", () => {
    const onSubmit = vi.fn();
    render(<TimingModal item={base} onSubmit={onSubmit} onClose={noop} />);
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: null,
      deadline: null,
      recurrence: null,
    });
  });

  it("lets the interval be retyped freely and saves the new value", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
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
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: null,
      deadline: "2026-08-01",
      recurrence: { unit: "week", interval: 3 },
    });
  });

  it("normalises a cleared interval back to 1 on blur and rejects non-digits", () => {
    const onSubmit = vi.fn();
    render(
      <TimingModal
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
    fireDomEvent(field, "focusout");
    expect(field.value).toBe("1");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      notBefore: null,
      deadline: "2026-08-01",
      recurrence: { unit: "month", interval: 1 },
    });
  });
});
