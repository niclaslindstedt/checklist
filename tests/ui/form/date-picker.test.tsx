// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { DatePicker } from "../../../src/ui/form/DatePicker.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DatePicker", () => {
  it("shows the selected date on the trigger and stays closed until clicked", () => {
    render(
      <DatePicker
        value="2026-08-01"
        onChange={() => {}}
        ariaLabel="Due date"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Due date" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("1 Aug 2026");
    // Calendar dialog is not mounted before opening.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the placeholder when no date is selected", () => {
    render(
      <DatePicker
        value=""
        onChange={() => {}}
        ariaLabel="Due date"
        placeholder="Pick a date"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Due date" }).textContent,
    ).toContain("Pick a date");
  });

  it("opens a calendar and commits the clicked day as YYYY-MM-DD", () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value="2026-08-01"
        onChange={onChange}
        ariaLabel="Due date"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));

    // Seeds on the selected month.
    expect(screen.getByText("August 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /\b15 August 2026$/ }));
    expect(onChange).toHaveBeenCalledWith("2026-08-15");
  });

  it("navigates months without committing and then picks the new month", () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value="2026-08-01"
        onChange={onChange}
        ariaLabel="Due date"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("September 2026")).toBeTruthy();
    // Month navigation alone commits nothing — the picker survives it (this is
    // the whole point on iOS, where the native picker dismissed here).
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("August 2026")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(
      screen.getByRole("button", { name: /\b10 September 2026$/ }),
    );
    expect(onChange).toHaveBeenCalledWith("2026-09-10");
  });

  it("jumps to a far-off year through the month and year drill-downs", () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value="2026-08-01"
        onChange={onChange}
        ariaLabel="Due date"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));

    // Day view → tap the caption to reach the month grid for the shown year.
    fireEvent.click(screen.getByRole("button", { name: "Choose month" }));
    expect(screen.getByText("2026")).toBeTruthy();

    // Month grid → tap the year caption to reach the year grid.
    fireEvent.click(screen.getByRole("button", { name: "Choose year" }));
    // 2026 sits in the 2016–2027 block.
    expect(screen.getByText("2016–2027")).toBeTruthy();

    // Page back one block and pick a year — that drops back to the month grid.
    fireEvent.click(screen.getByRole("button", { name: "Previous years" }));
    expect(screen.getByText("2004–2015")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2010" }));

    // Month grid for 2010 → pick March, which drops back to that month's days.
    expect(screen.getByText("2010")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "March" }));
    expect(screen.getByText("March 2010")).toBeTruthy();

    // Nothing committed until a day is chosen.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /\b12 March 2010$/ }));
    expect(onChange).toHaveBeenCalledWith("2010-03-12");
  });

  it("steps the year from the month grid without leaving it", () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value="2026-08-01"
        onChange={onChange}
        ariaLabel="Due date"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose month" }));

    fireEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(screen.getByText("2027")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    expect(screen.getByText("2026")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
