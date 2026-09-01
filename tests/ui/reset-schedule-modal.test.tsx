// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";

import { createChecklist } from "../../src/domain/checklists.ts";
import type { Checklist } from "../../src/domain/types.ts";
import { ResetScheduleModal } from "../../src/ui/ResetScheduleModal.tsx";
import { fireDomEvent } from "./fire-dom-event.ts";

const noop = (): void => {};
const base: Checklist = createChecklist(
  "l1",
  "Leaving home",
  "2026-06-01T07:00:00.000Z",
);

afterEach(cleanup);

describe("ResetScheduleModal", () => {
  it("defaults to every 1 day at 08:00 with the pop-up off", () => {
    const onSubmit = vi.fn();
    render(
      <ResetScheduleModal list={base} onSubmit={onSubmit} onClose={noop} />,
    );
    const interval = screen.getByLabelText(
      "Reset interval",
    ) as HTMLInputElement;
    const hour = screen.getByLabelText("Hour") as HTMLInputElement;
    const minute = screen.getByLabelText("Minute") as HTMLInputElement;
    expect(interval.value).toBe("1");
    expect(hour.value).toBe("8");
    expect(minute.value).toBe("00");
    // A digit-only pad on mobile for every number.
    expect(interval.getAttribute("inputmode")).toBe("numeric");
    expect(hour.getAttribute("inputmode")).toBe("numeric");
    expect(
      (screen.getByLabelText("Pop up after refresh") as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      screen.getByRole("combobox", { name: "Reset every" }).textContent,
    ).toContain("days");
    // Unscheduled: nothing to remove yet.
    expect(
      (screen.getByText("Remove schedule") as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      unit: "day",
      interval: 1,
      hour: 8,
      minute: 0,
      popUp: false,
    });
  });

  it("selects a number field's contents on focus so typing replaces it", () => {
    render(
      <ResetScheduleModal list={base} onSubmit={vi.fn()} onClose={noop} />,
    );
    const hour = screen.getByLabelText("Hour") as HTMLInputElement;
    const select = vi.spyOn(hour, "select");
    // Preact binds `onFocus` to the bubbling `focusin`, as the blur tests use
    // `focusout`.
    fireDomEvent(hour, "focusin");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("saves an edited cadence, time, and pop-up flag", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <ResetScheduleModal list={base} onSubmit={onSubmit} onClose={onClose} />,
    );
    fireEvent.change(screen.getByLabelText("Reset interval"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Reset every" }));
    fireEvent.click(screen.getByRole("option", { name: "weeks" }));
    fireEvent.change(screen.getByLabelText("Hour"), {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText("Minute"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByLabelText("Pop up after refresh"));
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      unit: "week",
      interval: 2,
      hour: 7,
      minute: 30,
      popUp: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("normalises the numbers on blur and clamps them on save", () => {
    const onSubmit = vi.fn();
    render(
      <ResetScheduleModal list={base} onSubmit={onSubmit} onClose={noop} />,
    );
    const interval = screen.getByLabelText(
      "Reset interval",
    ) as HTMLInputElement;
    const hour = screen.getByLabelText("Hour") as HTMLInputElement;
    const minute = screen.getByLabelText("Minute") as HTMLInputElement;
    // Non-digits never make it in; an emptied field repairs itself on blur.
    fireEvent.change(interval, { target: { value: "1a2" } });
    expect(interval.value).toBe("12");
    fireEvent.change(interval, { target: { value: "" } });
    fireDomEvent(interval, "focusout");
    expect(interval.value).toBe("1");
    // Out-of-range times clamp to the clock.
    fireEvent.change(hour, { target: { value: "99" } });
    fireDomEvent(hour, "focusout");
    expect(hour.value).toBe("23");
    fireEvent.change(minute, { target: { value: "7" } });
    fireDomEvent(minute, "focusout");
    expect(minute.value).toBe("07");
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ interval: 1, hour: 23, minute: 7 }),
    );
  });

  it("swaps the interval for a weekday picker, preselecting Monday to Friday", () => {
    const onSubmit = vi.fn();
    render(
      <ResetScheduleModal list={base} onSubmit={onSubmit} onClose={noop} />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Reset every" }));
    fireEvent.click(screen.getByRole("option", { name: "days of the week" }));
    // No interval to type any more; the day picker takes its place.
    expect(screen.queryByLabelText("Reset interval")).toBeNull();
    const picker = screen.getByRole("button", { name: "Days" });
    expect(picker.textContent).toContain("Mon");
    expect(picker.textContent).toContain("Fri");
    expect(picker.textContent).not.toContain("Sat");
    // Open it: seven checkable rows, weekdays on, weekend off.
    fireEvent.click(picker);
    expect(
      screen
        .getByRole("checkbox", { name: "Monday" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: "Saturday" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    // Drop Wednesday, add Saturday.
    fireEvent.click(screen.getByRole("checkbox", { name: "Wednesday" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Saturday" }));
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith({
      unit: "dayOfWeek",
      interval: 1,
      daysOfWeek: [1, 2, 4, 5, 6],
      hour: 8,
      minute: 0,
      popUp: false,
    });
  });

  it("refuses to save a weekday schedule with no days chosen", () => {
    const onSubmit = vi.fn();
    render(
      <ResetScheduleModal list={base} onSubmit={onSubmit} onClose={noop} />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Reset every" }));
    fireEvent.click(screen.getByRole("option", { name: "days of the week" }));
    fireEvent.click(screen.getByRole("button", { name: "Days" }));
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]) {
      fireEvent.click(screen.getByRole("checkbox", { name: day }));
    }
    expect(screen.getByText("Pick at least one day.")).toBeTruthy();
    const save = screen.getByText("Save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("previews when the schedule would next fire", () => {
    render(
      <ResetScheduleModal list={base} onSubmit={vi.fn()} onClose={noop} />,
    );
    // Daily at 08:00 always has a next occurrence, so the line names a time.
    expect(screen.getByText(/^Next reset: /).textContent).toMatch(/08:00/);
  });

  it("prefills an existing schedule and offers to remove it", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <ResetScheduleModal
        list={{
          ...base,
          resetSchedule: {
            unit: "month",
            interval: 3,
            hour: 18,
            minute: 15,
            popUp: true,
            since: "2026-06-01T07:00:00.000Z",
          },
        }}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
    expect(
      (screen.getByLabelText("Reset interval") as HTMLInputElement).value,
    ).toBe("3");
    expect((screen.getByLabelText("Hour") as HTMLInputElement).value).toBe(
      "18",
    );
    expect((screen.getByLabelText("Minute") as HTMLInputElement).value).toBe(
      "15",
    );
    expect(
      (screen.getByLabelText("Pop up after refresh") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      screen.getByRole("combobox", { name: "Reset every" }).textContent,
    ).toContain("months");
    const remove = screen.getByText("Remove schedule") as HTMLButtonElement;
    expect(remove.disabled).toBe(false);
    fireEvent.click(remove);
    expect(onSubmit).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
