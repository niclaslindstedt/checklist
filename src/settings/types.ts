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

// Which vertical edge the floating navigation button rests against once
// the user lets go of a drag.
export type MenuButtonSide = "left" | "right";

// The user's chosen resting spot for the floating navigation button.
// `side` picks the edge it snaps to; `y` is its vertical position as a
// fraction (0 = top, 1 = bottom) of the available travel, so it survives
// viewport resizes without storing raw pixels.
export type MenuButtonPosition = { side: MenuButtonSide; y: number };

export type Settings = {
  theme: ThemePreset;
  fontFamily: FontFamilyId;
  // UI text-size multiplier; one of `FONT_SCALE_PRESETS`.
  fontScale: number;
  customTheme: CustomTheme;
  // Where `addItem` inserts a new entry into the active list.
  addItemPosition: AddItemPosition;
  // Where the floating navigation button sits after the user drags it.
  menuButtonPosition: MenuButtonPosition;
  // Whether the floating navigation button is shown. Only honoured in the
  // installed PWA on Android / iOS (where the gesture replacing it — an
  // inward edge swipe — doesn't collide with the browser's back-swipe);
  // everywhere else the button always shows regardless of this flag.
  showMenuButton: boolean;
  // Whether the general-purpose toast stack is suppressed. When on, every
  // toast raised through `useToast().push` is silently dropped (action
  // confirmations, errors, namespace notices). The "new build ready"
  // upgrade hint is a separate surface (`UpdateToast`) and is never
  // suppressed by this flag.
  disableToasts: boolean;
};
