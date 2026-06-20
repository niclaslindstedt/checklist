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

  it("keeps a recognised addItemPosition and defaults the rest", () => {
    expect(validateSettings({ addItemPosition: "top" }).addItemPosition).toBe(
      "top",
    );
    expect(
      validateSettings({ addItemPosition: "bottom" }).addItemPosition,
    ).toBe("bottom");
  });

  it("falls back to the default addItemPosition on unknown values", () => {
    const d = defaultSettings();
    expect(d.addItemPosition).toBe("bottom");
    expect(
      validateSettings({ addItemPosition: "middle" }).addItemPosition,
    ).toBe(d.addItemPosition);
    expect(validateSettings({}).addItemPosition).toBe(d.addItemPosition);
  });

  it("defaults the menu button to the left edge, halfway down", () => {
    expect(defaultSettings().menuButtonPosition).toEqual({
      side: "left",
      y: 0.5,
    });
    expect(validateSettings({}).menuButtonPosition).toEqual({
      side: "left",
      y: 0.5,
    });
  });

  it("keeps a valid menu button position and clamps the fraction", () => {
    expect(
      validateSettings({ menuButtonPosition: { side: "right", y: 0.2 } })
        .menuButtonPosition,
    ).toEqual({ side: "right", y: 0.2 });
    expect(
      validateSettings({ menuButtonPosition: { side: "right", y: 5 } })
        .menuButtonPosition,
    ).toEqual({ side: "right", y: 1 });
    expect(
      validateSettings({ menuButtonPosition: { side: "left", y: -3 } })
        .menuButtonPosition,
    ).toEqual({ side: "left", y: 0 });
  });

  it("falls back to defaults for a malformed menu button position", () => {
    const d = defaultSettings().menuButtonPosition;
    expect(
      validateSettings({ menuButtonPosition: "left" }).menuButtonPosition,
    ).toEqual(d);
    expect(
      validateSettings({ menuButtonPosition: { side: "up", y: "x" } })
        .menuButtonPosition,
    ).toEqual(d);
  });

  it("shows the menu button by default and honours an explicit boolean", () => {
    expect(defaultSettings().showMenuButton).toBe(true);
    expect(validateSettings({}).showMenuButton).toBe(true);
    expect(validateSettings({ showMenuButton: false }).showMenuButton).toBe(
      false,
    );
  });

  it("falls back to showing the menu button on a non-boolean value", () => {
    expect(validateSettings({ showMenuButton: "no" }).showMenuButton).toBe(
      true,
    );
  });

  it("enables toasts by default and honours an explicit boolean", () => {
    expect(defaultSettings().disableToasts).toBe(false);
    expect(validateSettings({}).disableToasts).toBe(false);
    expect(validateSettings({ disableToasts: true }).disableToasts).toBe(true);
  });

  it("falls back to enabled toasts on a non-boolean value", () => {
    expect(validateSettings({ disableToasts: "yes" }).disableToasts).toBe(
      false,
    );
  });

  it("enables item notes by default and honours an explicit boolean", () => {
    expect(defaultSettings().disableItemNotes).toBe(false);
    expect(validateSettings({}).disableItemNotes).toBe(false);
    expect(validateSettings({ disableItemNotes: true }).disableItemNotes).toBe(
      true,
    );
  });

  it("falls back to enabled item notes on a non-boolean value", () => {
    expect(validateSettings({ disableItemNotes: "yes" }).disableItemNotes).toBe(
      false,
    );
  });

  it("shows the item count by default and honours an explicit boolean", () => {
    expect(defaultSettings().showItemCount).toBe(true);
    expect(validateSettings({}).showItemCount).toBe(true);
    expect(validateSettings({ showItemCount: false }).showItemCount).toBe(false);
  });

  it("falls back to a shown item count on a non-boolean value", () => {
    expect(validateSettings({ showItemCount: "no" }).showItemCount).toBe(true);
  });

  it("keeps checked items in place by default and honours an explicit boolean", () => {
    expect(defaultSettings().sortCheckedToBottom).toBe(false);
    expect(validateSettings({}).sortCheckedToBottom).toBe(false);
    expect(
      validateSettings({ sortCheckedToBottom: true }).sortCheckedToBottom,
    ).toBe(true);
  });

  it("falls back to the default sortCheckedToBottom on a non-boolean value", () => {
    expect(
      validateSettings({ sortCheckedToBottom: "yes" }).sortCheckedToBottom,
    ).toBe(false);
  });

  it("enables achievements by default and honours an explicit boolean", () => {
    expect(defaultSettings().disableAchievements).toBe(false);
    expect(validateSettings({}).disableAchievements).toBe(false);
    expect(
      validateSettings({ disableAchievements: true }).disableAchievements,
    ).toBe(true);
  });

  it("falls back to enabled achievements on a non-boolean value", () => {
    expect(
      validateSettings({ disableAchievements: "yes" }).disableAchievements,
    ).toBe(false);
  });
});
