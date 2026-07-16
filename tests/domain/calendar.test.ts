import { describe, expect, it } from "vitest";

import {
  addMonths,
  buildMonthGrid,
  parseISODate,
  toISODate,
  yearRangeStart,
} from "../../src/domain/calendar.ts";

describe("toISODate", () => {
  it("zero-pads month and day", () => {
    expect(toISODate(2026, 1, 5)).toBe("2026-01-05");
    expect(toISODate(2026, 12, 31)).toBe("2026-12-31");
  });
});

describe("parseISODate", () => {
  it("parses a well-formed day", () => {
    expect(parseISODate("2026-08-01")).toEqual({
      year: 2026,
      month: 8,
      day: 1,
    });
  });

  it("rejects malformed strings", () => {
    expect(parseISODate("")).toBeNull();
    expect(parseISODate("2026-8-1")).toBeNull();
    expect(parseISODate("not-a-date")).toBeNull();
  });

  it("rejects impossible calendar days", () => {
    expect(parseISODate("2026-02-30")).toBeNull();
    expect(parseISODate("2026-13-01")).toBeNull();
    // 2024 is a leap year, so Feb 29 is valid; 2026 is not.
    expect(parseISODate("2024-02-29")).not.toBeNull();
    expect(parseISODate("2026-02-29")).toBeNull();
  });
});

describe("addMonths", () => {
  it("steps within a year", () => {
    expect(addMonths(2026, 3, 2)).toEqual({ year: 2026, month: 5 });
  });

  it("rolls the year forward and backward", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths(2026, 6, -12)).toEqual({ year: 2025, month: 6 });
  });
});

describe("yearRangeStart", () => {
  it("aligns to fixed, non-overlapping 12-year blocks", () => {
    // 2026 → 2016–2027; the block start is a multiple of the size.
    expect(yearRangeStart(2026)).toBe(2016);
    expect(yearRangeStart(2016)).toBe(2016);
    expect(yearRangeStart(2027)).toBe(2016);
    expect(yearRangeStart(2028)).toBe(2028);
    expect(yearRangeStart(2015)).toBe(2004);
  });

  it("honours a custom block size", () => {
    expect(yearRangeStart(2026, 10)).toBe(2020);
    expect(yearRangeStart(2029, 10)).toBe(2020);
    expect(yearRangeStart(2030, 10)).toBe(2030);
  });
});

describe("buildMonthGrid", () => {
  it("returns six weeks of seven days", () => {
    const grid = buildMonthGrid(2026, 8, 1);
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it("lays out August 2026 Monday-first with the right lead/trail", () => {
    // 2026-08-01 is a Saturday. Monday-first ⇒ five leading days (Mon–Fri)
    // borrowed from July.
    const grid = buildMonthGrid(2026, 8, 1);
    const flat = grid.flat();
    expect(flat[0]).toMatchObject({ iso: "2026-07-27", inMonth: false });
    expect(flat[4]).toMatchObject({ iso: "2026-07-31", inMonth: false });
    expect(flat[5]).toMatchObject({ iso: "2026-08-01", inMonth: true });
    // August has 31 days: 5 lead + 31 = 36 cells in-month range, then trail.
    expect(flat[35]).toMatchObject({ iso: "2026-08-31", inMonth: true });
    expect(flat[36]).toMatchObject({ iso: "2026-09-01", inMonth: false });
    // Last cell fills the 42-cell grid from September.
    expect(flat[41]).toMatchObject({ iso: "2026-09-06", inMonth: false });
  });

  it("shifts the lead when the week starts on Sunday", () => {
    // Sunday-first ⇒ August 1 (Saturday) sits at column 6, so six lead days.
    const grid = buildMonthGrid(2026, 8, 0);
    const flat = grid.flat();
    expect(flat[0]).toMatchObject({ iso: "2026-07-26", inMonth: false });
    expect(flat[6]).toMatchObject({ iso: "2026-08-01", inMonth: true });
  });

  it("marks every in-month cell as inMonth exactly once per day", () => {
    const inMonth = buildMonthGrid(2026, 2, 1)
      .flat()
      .filter((c) => c.inMonth)
      .map((c) => c.iso);
    // 2026 is not a leap year → 28 distinct February days.
    expect(inMonth).toHaveLength(28);
    expect(new Set(inMonth).size).toBe(28);
    expect(inMonth[0]).toBe("2026-02-01");
    expect(inMonth[27]).toBe("2026-02-28");
  });
});
