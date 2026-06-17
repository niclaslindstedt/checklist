import { describe, expect, it } from "vitest";

import {
  COLOR_KEYS,
  DARK_THEMES,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
  DEFAULT_CUSTOM_THEME_COLORS_LIGHT,
  LIGHT_THEMES,
  PRESET_PALETTES,
  THEMES,
  customThemeSeed,
  themeFamily,
} from "../../src/theme/themes.ts";

describe("themeFamily", () => {
  it("folds every dark variant into the dark family", () => {
    for (const preset of DARK_THEMES) {
      expect(themeFamily(preset)).toBe("dark");
    }
  });

  it("folds every light variant into the light family", () => {
    for (const preset of LIGHT_THEMES) {
      expect(themeFamily(preset)).toBe("light");
    }
  });

  it("treats system and custom as their own families", () => {
    expect(themeFamily("system")).toBe("system");
    expect(themeFamily("custom")).toBe("custom");
  });
});

describe("customThemeSeed", () => {
  it("seeds from the named preset's palette", () => {
    expect(customThemeSeed("monokai", false).colors).toBe(
      PRESET_PALETTES.monokai,
    );
  });

  it("seeds system from the light or dark palette per prefers-color-scheme", () => {
    expect(customThemeSeed("system", true).colors).toBe(
      DEFAULT_CUSTOM_THEME_COLORS_LIGHT,
    );
    expect(customThemeSeed("system", false).colors).toBe(
      DEFAULT_CUSTOM_THEME_COLORS_DARK,
    );
  });

  it("seeds custom from the dark palette (the pristine default)", () => {
    expect(customThemeSeed("custom", true).colors).toBe(
      DEFAULT_CUSTOM_THEME_COLORS_DARK,
    );
  });

  it("carries the shape defaults across from DEFAULT_CUSTOM_THEME", () => {
    const seed = customThemeSeed("dark", false);
    expect(seed.radius).toBe(DEFAULT_CUSTOM_THEME.radius);
    expect(seed.density).toBe(DEFAULT_CUSTOM_THEME.density);
    expect(seed.borderWidth).toBe(DEFAULT_CUSTOM_THEME.borderWidth);
    expect(seed.reduceMotion).toBe(DEFAULT_CUSTOM_THEME.reduceMotion);
  });
});

describe("preset palette completeness", () => {
  it("defines every colour slot for every coloured preset", () => {
    const coloured = THEMES.filter((t) => t !== "system" && t !== "custom");
    for (const preset of coloured) {
      const palette = PRESET_PALETTES[preset as keyof typeof PRESET_PALETTES];
      expect(palette, `palette for ${preset}`).toBeDefined();
      for (const key of COLOR_KEYS) {
        expect(palette[key], `${preset}.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
