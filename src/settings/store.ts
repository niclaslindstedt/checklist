// Persistence + validation for the appearance `Settings`. One JSON blob
// in localStorage under `checklist:settings:v1`. Defensive on read — a
// missing, corrupt, or partially-written value falls back to the
// defaults field by field, so a hand-edited or older blob still loads
// rather than throwing. Cloned in spirit from the budget project's
// settings reducer + validator, collapsed to one module because the
// checklist's settings surface is small.

import {
  COLOR_KEYS,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SCALE,
  DEFAULT_THEME,
  FONT_FAMILIES,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  THEMES,
  type BorderWidthPreset,
  type CustomTheme,
  type CustomThemeColors,
  type DensityPreset,
  type FontFamilyId,
  type RadiusPreset,
  type ThemePreset,
} from "../theme/themes.ts";
import type { AddItemPosition, MenuButtonPosition, Settings } from "./types.ts";

const SETTINGS_KEY = "checklist:settings:v1";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// New items append to the bottom by default — the long-standing behaviour
// before this preference existed.
export const DEFAULT_ADD_ITEM_POSITION: AddItemPosition = "bottom";

// The floating navigation button starts pinned to the left edge, halfway
// down — where it lived before it became draggable.
export const DEFAULT_MENU_BUTTON_POSITION: MenuButtonPosition = {
  side: "left",
  y: 0.5,
};

// The floating navigation button is shown by default. The PWA-only opt-out
// (replacing it with an inward edge swipe) is off until the user asks for it.
export const DEFAULT_SHOW_MENU_BUTTON = true;

// Toasts are shown by default. The opt-out suppresses the whole general
// toast stack (but never the "new build ready" upgrade hint).
export const DEFAULT_DISABLE_TOASTS = false;

// The achievements system is on by default. The opt-out stops tracking and
// hides the trophy button without discarding already-earned progress.
export const DEFAULT_DISABLE_ACHIEVEMENTS = false;

export function defaultSettings(): Settings {
  return {
    theme: DEFAULT_THEME,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontScale: DEFAULT_FONT_SCALE,
    customTheme: DEFAULT_CUSTOM_THEME,
    addItemPosition: DEFAULT_ADD_ITEM_POSITION,
    menuButtonPosition: DEFAULT_MENU_BUTTON_POSITION,
    showMenuButton: DEFAULT_SHOW_MENU_BUTTON,
    disableToasts: DEFAULT_DISABLE_TOASTS,
    disableAchievements: DEFAULT_DISABLE_ACHIEVEMENTS,
    achievements: {},
    unseenAchievements: [],
  };
}

// Coerce a stored value into the achievements map: a plain object whose
// values are finite numbers (unlock timestamps). Anything malformed is
// dropped rather than throwing, so an older or hand-edited blob still loads.
function validAchievements(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [id, ts] of Object.entries(v)) {
    if (typeof ts === "number" && Number.isFinite(ts)) out[id] = ts;
  }
  return out;
}

// Coerce a stored value into the unseen-achievements list: a string array
// narrowed to ids that actually appear in the unlocked map (a stale unseen
// id with no unlock can't be earned, so it's noise).
function validUnseen(v: unknown, unlocked: Record<string, number>): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (id): id is string => typeof id === "string" && unlocked[id] !== undefined,
  );
}

function validMenuButtonPosition(v: unknown): MenuButtonPosition {
  if (!isRecord(v)) return DEFAULT_MENU_BUTTON_POSITION;
  const side = oneOf<MenuButtonPosition["side"]>(
    v.side,
    ["left", "right"],
    DEFAULT_MENU_BUTTON_POSITION.side,
  );
  const y =
    typeof v.y === "number" && Number.isFinite(v.y)
      ? Math.min(1, Math.max(0, v.y))
      : DEFAULT_MENU_BUTTON_POSITION.y;
  return { side, y };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function validColors(v: unknown): CustomThemeColors {
  const base = DEFAULT_CUSTOM_THEME.colors;
  if (!isRecord(v)) return { ...base };
  const out = { ...base };
  for (const key of COLOR_KEYS) {
    const raw = v[key];
    if (typeof raw === "string" && HEX_RE.test(raw)) out[key] = raw;
  }
  return out;
}

function validCustomTheme(v: unknown): CustomTheme {
  if (!isRecord(v)) return DEFAULT_CUSTOM_THEME;
  return {
    colors: validColors(v.colors),
    radius: oneOf<RadiusPreset>(
      v.radius,
      ["none", "sm", "md", "lg"],
      DEFAULT_CUSTOM_THEME.radius,
    ),
    density: oneOf<DensityPreset>(
      v.density,
      ["compact", "comfortable", "spacious"],
      DEFAULT_CUSTOM_THEME.density,
    ),
    borderWidth: oneOf<BorderWidthPreset>(
      v.borderWidth,
      ["thin", "normal", "bold"],
      DEFAULT_CUSTOM_THEME.borderWidth,
    ),
    reduceMotion:
      typeof v.reduceMotion === "boolean"
        ? v.reduceMotion
        : DEFAULT_CUSTOM_THEME.reduceMotion,
  };
}

function validFontScale(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return DEFAULT_FONT_SCALE;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, v));
}

/** Coerce any stored value into a complete, valid `Settings`. */
export function validateSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return defaultSettings();
  const achievements = validAchievements(raw.achievements);
  return {
    theme: oneOf<ThemePreset>(raw.theme, THEMES, DEFAULT_THEME),
    fontFamily: oneOf<FontFamilyId>(
      raw.fontFamily,
      FONT_FAMILIES.map((f) => f.id),
      DEFAULT_FONT_FAMILY,
    ),
    fontScale: validFontScale(raw.fontScale),
    customTheme: validCustomTheme(raw.customTheme),
    addItemPosition: oneOf<AddItemPosition>(
      raw.addItemPosition,
      ["top", "bottom"],
      DEFAULT_ADD_ITEM_POSITION,
    ),
    menuButtonPosition: validMenuButtonPosition(raw.menuButtonPosition),
    showMenuButton:
      typeof raw.showMenuButton === "boolean"
        ? raw.showMenuButton
        : DEFAULT_SHOW_MENU_BUTTON,
    disableToasts:
      typeof raw.disableToasts === "boolean"
        ? raw.disableToasts
        : DEFAULT_DISABLE_TOASTS,
    disableAchievements:
      typeof raw.disableAchievements === "boolean"
        ? raw.disableAchievements
        : DEFAULT_DISABLE_ACHIEVEMENTS,
    achievements,
    unseenAchievements: validUnseen(raw.unseenAchievements, achievements),
  };
}

/** Read and validate the persisted settings, or the defaults when none. */
export function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return validateSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

/** Persist the settings blob. Best-effort — swallows quota/access errors. */
export function saveSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage blocked — in-memory only for this session
  }
}
