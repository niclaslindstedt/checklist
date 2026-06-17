// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SUPPORTED_LANGS,
  bcp47,
  detectInitialLanguage,
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
  it("maps the supported codes to concrete locales", () => {
    expect(bcp47("sv")).toBe("sv-SE");
    expect(bcp47("en")).toBe("en-GB");
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
