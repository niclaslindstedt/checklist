// The user's persisted appearance preferences. Modelled on the budget
// project's `Settings` (the appearance slice of it): theme preset, font
// family + size, and the Custom-theme overrides. Plain JSON so the store
// can round-trip it through localStorage.
//
// Developer-mode flags (dev mode, log capture, fake data) deliberately
// live OUTSIDE this type — they're device-local diagnostics that
// shouldn't travel with an export or sync, so they sit in their own
// modules under `src/dev/`.

import type {
  CustomTheme,
  FontFamilyId,
  ThemePreset,
} from "../theme/themes.ts";

// Where a newly added item lands in the list: prepended to the top or
// appended to the bottom.
export type AddItemPosition = "top" | "bottom";

export type Settings = {
  theme: ThemePreset;
  fontFamily: FontFamilyId;
  // UI text-size multiplier; one of `FONT_SCALE_PRESETS`.
  fontScale: number;
  customTheme: CustomTheme;
  // Where `addItem` inserts a new entry into the active list.
  addItemPosition: AddItemPosition;
};
