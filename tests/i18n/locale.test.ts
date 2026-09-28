// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SUPPORTED_LANGS,
  bcp47,
  dayPeriodLabels,
  detectInitialLanguage,
  formatTimeOfDay,
  usesTwelveHourClock,
  weekStartsOn,
} from "../../src/i18n/locale.ts";
import {
  LANGUAGE_EVENT,
  readLanguagePreference,
  writeLanguagePreference,
} from "../../src/i18n/language-preference.ts";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("bcp47", () => {
  it("keeps Swedish Swedish on any device", () => {
    expect(bcp47("sv", "sv-SE")).toBe("sv-SE");
    expect(bcp47("sv", "en-US")).toBe("sv-SE");
  });

  it("follows an English device's own locale", () => {
    expect(bcp47("en", "en-US")).toBe("en-US");
    expect(bcp47("en", "en-GB")).toBe("en-GB");
    expect(bcp47("en", "en-AU")).toBe("en-AU");
  });

  it("borrows the region of a device in another language", () => {
    expect(bcp47("en", "sv-SE")).toBe("en-SE");
    expect(bcp47("en", "de-DE")).toBe("en-DE");
  });

  it("reads as US English without a usable device locale", () => {
    expect(bcp47("en", "")).toBe("en-US");
    expect(bcp47("en", "fr")).toBe("en-US");
    expect(bcp47("en", "not a tag!")).toBe("en-US");
  });

  it("reads the device from navigator.language by default", () => {
    Object.defineProperty(navigator, "language", {
      value: "en-GB",
      configurable: true,
    });
    expect(bcp47("en")).toBe("en-GB");
  });

  it("prints a due date the way each locale does", () => {
    const due = new Date(2026, 8, 27);
    const short = (lang: "en" | "sv", device: string) =>
      due.toLocaleDateString(bcp47(lang, device), {
        day: "numeric",
        month: "short",
      });
    expect(short("en", "en-US")).toBe("Sep 27");
    expect(short("en", "en-GB")).toBe("27 Sept");
    expect(short("sv", "en-US")).toBe("27 sep.");
  });
});

describe("weekStartsOn", () => {
  it("starts a US week on Sunday", () => {
    expect(weekStartsOn("en-US")).toBe(0);
    expect(weekStartsOn("en")).toBe(0);
  });

  it("starts a British and a Swedish week on Monday", () => {
    expect(weekStartsOn("en-GB")).toBe(1);
    expect(weekStartsOn("sv-SE")).toBe(1);
    expect(weekStartsOn("en-SE")).toBe(1);
  });

  it("falls back to the region table without Intl week info", () => {
    const proto = Intl.Locale.prototype as unknown as Record<string, unknown>;
    const own = Object.getOwnPropertyDescriptor(proto, "getWeekInfo");
    const ownInfo = Object.getOwnPropertyDescriptor(proto, "weekInfo");
    delete proto.getWeekInfo;
    delete proto.weekInfo;
    try {
      expect(weekStartsOn("en-US")).toBe(0);
      expect(weekStartsOn("en-GB")).toBe(1);
      expect(weekStartsOn("sv-SE")).toBe(1);
    } finally {
      if (own) Object.defineProperty(proto, "getWeekInfo", own);
      if (ownInfo) Object.defineProperty(proto, "weekInfo", ownInfo);
    }
  });

  it("starts on Monday for a tag it cannot read", () => {
    expect(weekStartsOn("not a tag!")).toBe(1);
  });
});

describe("usesTwelveHourClock", () => {
  it("is true where the clock reads AM and PM", () => {
    expect(usesTwelveHourClock("en-US")).toBe(true);
  });

  it("is false where the clock runs to 23", () => {
    expect(usesTwelveHourClock("en-GB")).toBe(false);
    expect(usesTwelveHourClock("sv-SE")).toBe(false);
  });
});

describe("dayPeriodLabels", () => {
  it("names the two halves of the day in the locale's own words", () => {
    expect(dayPeriodLabels("en-US")).toEqual(["AM", "PM"]);
  });
});

describe("formatTimeOfDay", () => {
  it("uses the 12-hour clock in the US", () => {
    expect(formatTimeOfDay("07:05", "en-US")).toMatch(/^7:05\sAM$/);
    expect(formatTimeOfDay("19:30", "en-US")).toMatch(/^7:30\sPM$/);
  });

  it("keeps the 24-hour clock in Britain and Sweden", () => {
    expect(formatTimeOfDay("07:05", "en-GB")).toBe("07:05");
    expect(formatTimeOfDay("19:30", "sv-SE")).toBe("19:30");
  });

  it("returns a malformed time as it is", () => {
    expect(formatTimeOfDay("soon", "en-US")).toBe("soon");
  });
});

describe("SUPPORTED_LANGS", () => {
  it("lists exactly the two supported codes", () => {
    expect([...SUPPORTED_LANGS]).toEqual(["en", "sv"]);
  });
});

describe("detectInitialLanguage", () => {
  function stubLanguage(value: string | undefined): void {
    Object.defineProperty(navigator, "language", {
      value,
      configurable: true,
    });
  }

  it("returns Swedish for any sv-* browser language", () => {
    stubLanguage("sv-SE");
    expect(detectInitialLanguage()).toBe("sv");
  });

  it("is case-insensitive on the language tag", () => {
    stubLanguage("SV-fi");
    expect(detectInitialLanguage()).toBe("sv");
  });

  it("falls back to English for any other language", () => {
    stubLanguage("de-DE");
    expect(detectInitialLanguage()).toBe("en");
  });

  it("falls back to English when navigator.language is empty", () => {
    stubLanguage(undefined);
    expect(detectInitialLanguage()).toBe("en");
  });

  it("falls back to English when there is no navigator at all", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectInitialLanguage()).toBe("en");
  });
});

describe("language preference mirror", () => {
  it("returns a stored, valid preference", () => {
    localStorage.setItem("checklist:settings:language", "sv");
    expect(readLanguagePreference()).toBe("sv");
  });

  it("detects rather than trusting an invalid stored value", () => {
    localStorage.setItem("checklist:settings:language", "fr");
    Object.defineProperty(navigator, "language", {
      value: "sv-SE",
      configurable: true,
    });
    expect(readLanguagePreference()).toBe("sv");
  });

  it("persists a written preference for the next read", () => {
    writeLanguagePreference("sv");
    expect(localStorage.getItem("checklist:settings:language")).toBe("sv");
    expect(readLanguagePreference()).toBe("sv");
  });

  it("broadcasts a language-switch event on write", () => {
    const handler = vi.fn();
    window.addEventListener(LANGUAGE_EVENT, handler);
    writeLanguagePreference("en");
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]![0] as CustomEvent<string>;
    expect(event.detail).toBe("en");
    window.removeEventListener(LANGUAGE_EVENT, handler);
  });

  it("still broadcasts even when the localStorage write fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const handler = vi.fn();
    window.addEventListener(LANGUAGE_EVENT, handler);
    expect(() => writeLanguagePreference("sv")).not.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(LANGUAGE_EVENT, handler);
  });
});
