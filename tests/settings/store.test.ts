import { describe, expect, it } from "vitest";

import { defaultSettings, validateSettings } from "../../src/settings/store.ts";
import { DEFAULT_CUSTOM_THEME } from "../../src/theme/themes.ts";

describe("validateSettings", () => {
  it("returns defaults for non-object input", () => {
    expect(validateSettings(null)).toEqual(defaultSettings());
    expect(validateSettings("nope")).toEqual(defaultSettings());
    expect(validateSettings(42)).toEqual(defaultSettings());
  });

  it("keeps recognised theme / font / scale values", () => {
    const out = validateSettings({
      theme: "dracula",
      fontFamily: "serif",
      fontScale: 1.1,
    });
    expect(out.theme).toBe("dracula");
    expect(out.fontFamily).toBe("serif");
    expect(out.fontScale).toBe(1.1);
  });

  it("falls back field-by-field on unknown values", () => {
    const out = validateSettings({
      theme: "neon",
      fontFamily: "papyrus",
      fontScale: "big",
    });
    const d = defaultSettings();
    expect(out.theme).toBe(d.theme);
    expect(out.fontFamily).toBe(d.fontFamily);
    expect(out.fontScale).toBe(d.fontScale);
  });

  it("clamps the font scale into the supported range", () => {
    expect(validateSettings({ fontScale: 5 }).fontScale).toBe(1.25);
    expect(validateSettings({ fontScale: 0.1 }).fontScale).toBe(0.9);
  });

  it("keeps valid hex custom colours and drops malformed ones", () => {
    const out = validateSettings({
      theme: "custom",
      customTheme: {
        colors: { accent: "#abcdef", danger: "not-a-colour" },
        radius: "lg",
        density: "spacious",
        borderWidth: "bold",
        reduceMotion: true,
      },
    });
    expect(out.customTheme.colors.accent).toBe("#abcdef");
    // Malformed colour falls back to the default palette's value.
    expect(out.customTheme.colors.danger).toBe(
      DEFAULT_CUSTOM_THEME.colors.danger,
    );
    expect(out.customTheme.radius).toBe("lg");
    expect(out.customTheme.density).toBe("spacious");
    expect(out.customTheme.borderWidth).toBe("bold");
    expect(out.customTheme.reduceMotion).toBe(true);
  });
});
