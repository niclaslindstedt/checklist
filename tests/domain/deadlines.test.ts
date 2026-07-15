import { describe, expect, it } from "vitest";

import {
  addRecurrence,
  daysUntil,
  deadlineStatus,
  nextOccurrence,
} from "../../src/domain/deadlines.ts";

// A fixed "now" so the urgency buckets are deterministic — noon on 2026-07-15.
const NOW = "2026-07-15T12:00:00.000Z";

describe("daysUntil", () => {
  it("counts whole calendar days, ignoring the time of day", () => {
    expect(daysUntil("2026-07-15", NOW)).toBe(0);
    expect(daysUntil("2026-07-16", NOW)).toBe(1);
    expect(daysUntil("2026-07-22", NOW)).toBe(7);
    expect(daysUntil("2026-07-14", NOW)).toBe(-1);
  });
});

describe("deadlineStatus", () => {
  it("buckets by how soon the due date is", () => {
    expect(deadlineStatus("2026-07-14", NOW)).toBe("overdue"); // yesterday
    expect(deadlineStatus("2026-07-15", NOW)).toBe("due-soon"); // today
    expect(deadlineStatus("2026-07-16", NOW)).toBe("due-soon"); // tomorrow
    expect(deadlineStatus("2026-07-17", NOW)).toBe("upcoming"); // 2 days
    expect(deadlineStatus("2026-07-22", NOW)).toBe("upcoming"); // 7 days
    expect(deadlineStatus("2026-07-23", NOW)).toBe("later"); // 8 days
  });
});

describe("addRecurrence", () => {
  it("adds whole weeks as days", () => {
    expect(addRecurrence("2026-07-15", { unit: "week", interval: 1 })).toBe(
      "2026-07-22",
    );
    expect(addRecurrence("2026-07-15", { unit: "week", interval: 3 })).toBe(
      "2026-08-05",
    );
  });

  it("adds months and clamps the day to the shorter month", () => {
    expect(addRecurrence("2026-01-31", { unit: "month", interval: 1 })).toBe(
      "2026-02-28",
    );
    expect(addRecurrence("2026-11-30", { unit: "month", interval: 3 })).toBe(
      "2027-02-28",
    );
  });

  it("adds years and clamps a leap day", () => {
    expect(addRecurrence("2024-02-29", { unit: "year", interval: 1 })).toBe(
      "2025-02-28",
    );
    expect(addRecurrence("2026-07-15", { unit: "year", interval: 2 })).toBe(
      "2028-07-15",
    );
  });
});

describe("nextOccurrence", () => {
  it("advances a future deadline by exactly one interval", () => {
    expect(
      nextOccurrence("2026-07-20", { unit: "week", interval: 1 }, NOW),
    ).toBe("2026-07-27");
  });

  it("rolls a badly-overdue deadline forward onto a future date, on cadence", () => {
    // Weekly, but four weeks overdue — land on the first future Monday-equivalent.
    const next = nextOccurrence(
      "2026-06-15",
      { unit: "week", interval: 1 },
      NOW,
    );
    expect(daysUntil(next, NOW)).toBeGreaterThan(0);
    // On cadence: still a whole number of weeks from the original date.
    expect(daysUntil(next, "2026-06-15T00:00:00.000Z") % 7).toBe(0);
  });
});
