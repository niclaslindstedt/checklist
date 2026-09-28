import { describe, expect, it } from "vitest";

import { readHour, toTwelveHour } from "../../src/domain/time-of-day.ts";

describe("toTwelveHour", () => {
  it("reads midnight and noon as 12", () => {
    expect(toTwelveHour(0)).toEqual({ hour: 12, pm: false });
    expect(toTwelveHour(12)).toEqual({ hour: 12, pm: true });
  });

  it("splits the rest into the two halves of the day", () => {
    expect(toTwelveHour(7)).toEqual({ hour: 7, pm: false });
    expect(toTwelveHour(19)).toEqual({ hour: 7, pm: true });
    expect(toTwelveHour(23)).toEqual({ hour: 11, pm: true });
  });
});

describe("readHour", () => {
  it("reads 1–12 with the chosen period on a 12-hour clock", () => {
    expect(readHour("7", true, false)).toBe(7);
    expect(readHour("7", true, true)).toBe(19);
    expect(readHour("12", true, false)).toBe(0);
    expect(readHour("12", true, true)).toBe(12);
  });

  it("takes 0 and 13–23 as 24-hour hours on a 12-hour clock", () => {
    expect(readHour("0", true, true)).toBe(0);
    expect(readHour("19", true, false)).toBe(19);
    expect(readHour("99", true, false)).toBe(23);
  });

  it("reads the typed hour as it is on a 24-hour clock", () => {
    expect(readHour("7", false, true)).toBe(7);
    expect(readHour("19", false, false)).toBe(19);
    expect(readHour("", false, false)).toBe(0);
    expect(readHour("99", false, false)).toBe(23);
  });
});
