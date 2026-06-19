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
  // Whether checked items are sorted to the bottom of the active list. When
  // on, checking an item sinks it below the still-unchecked ones, with the
  // most recently checked item heading the checked group. A view-only sort:
  // the stored document order is never reordered, so unchecking an item drops
  // it straight back where it sat.
  sortCheckedToBottom: boolean;
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
  // Whether item notes (the markdown body beneath an item's title) are
  // switched off across the checklist. When on, the row hides the expand
  // chevron and never renders a body, and the in-place editor drops the
  // "Add note" affordance and the Shift+Enter reveal — items become
  // title-only. Existing notes are preserved in the document (just not
  // shown or editable), so flipping the toggle back off brings them back.
  disableItemNotes: boolean;
  // Whether the achievements system is switched off. When on, the watcher
  // stops recording unlocks and raising celebratory toasts, and the header
  // trophy button is hidden. Already-earned achievements are preserved (the
  // `achievements` map below is left untouched), so flipping the toggle back
  // off resumes tracking forward-going without backfilling anything missed
  // while it was disabled.
  disableAchievements: boolean;
  // Earned achievements: a map of achievement `id` → unlock timestamp (ms
  // since epoch). Lives in the synced `Settings` (not the device-local dev
  // flags) so a user's progress travels with their settings.json across
  // devices, exactly as the budget project keeps it in user data. Write-
  // once per id: re-recording an unlock is a no-op so timestamps don't
  // drift. See `src/achievements/`.
  achievements: Record<string, number>;
  // Achievements unlocked since the user last opened the achievements list.
  // Drives the trophy button's "new" badge; cleared to empty when the list
  // modal is opened. A subset of the keys in `achievements`.
  unseenAchievements: string[];
};
