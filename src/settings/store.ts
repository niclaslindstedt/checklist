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
import type { AddItemPosition, Settings } from "./types.ts";

const SETTINGS_KEY = "checklist:settings:v1";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// New items append to the bottom by default — the long-standing behaviour
// before this preference existed.
export const DEFAULT_ADD_ITEM_POSITION: AddItemPosition = "bottom";

export function defaultSettings(): Settings {
  return {
    theme: DEFAULT_THEME,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontScale: DEFAULT_FONT_SCALE,
    customTheme: DEFAULT_CUSTOM_THEME,
    addItemPosition: DEFAULT_ADD_ITEM_POSITION,
  };
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
