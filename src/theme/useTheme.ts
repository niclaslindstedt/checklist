// Theme engine, adapted from the budget project's `useTheme` hook. It
// projects the chosen preset and font stack onto `<html>`: CSS owns the
// palettes (see `src/styles/palettes.css`), so the hook only writes the
// `data-theme` attribute and the `--app-font-family` variable. A `system`
// preset resolves through `prefers-color-scheme` and re-applies when the
// OS scheme flips.
//
// There's no Appearance UI yet — the app reads the stored preference once
// (defaulting to dark) and applies it. `storeTheme` / `storeFontFamily`
// are exported so a future picker can persist a change and re-render.

import { useEffect } from "react";

import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_THEME,
  FONT_FAMILIES,
  THEMES,
  type FontFamilyId,
  type ThemePreset,
} from "./themes.ts";

const THEME_KEY = "checklist:settings:theme";
const FONT_KEY = "checklist:settings:font";

function readPref<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw && (allowed as readonly string[]).includes(raw)
      ? (raw as T)
      : fallback;
  } catch {
    return fallback;
  }
}

/** The persisted theme preference, or the default when none is stored. */
export function getStoredTheme(): ThemePreset {
  return readPref(THEME_KEY, THEMES, DEFAULT_THEME);
}

/** The persisted font preference, or the default when none is stored. */
export function getStoredFontFamily(): FontFamilyId {
  return readPref(
    FONT_KEY,
    FONT_FAMILIES.map((f) => f.id),
    DEFAULT_FONT_FAMILY,
  );
}

/** Persist a theme preset. Ready for a future Appearance picker. */
export function storeTheme(theme: ThemePreset): void {
  try {
    globalThis.localStorage?.setItem(THEME_KEY, theme);
  } catch {
    // storage blocked — in-memory only
  }
}

/** Persist a font family. Ready for a future Appearance picker. */
export function storeFontFamily(fontFamily: FontFamilyId): void {
  try {
    globalThis.localStorage?.setItem(FONT_KEY, fontFamily);
  } catch {
    // storage blocked — in-memory only
  }
}

// Resolve `system` to a concrete palette via the OS colour scheme; the
// concrete presets pass straight through.
function resolve(theme: ThemePreset): "dark" | "light" {
  if (theme !== "system") return theme;
  const prefersLight =
    globalThis.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
  return prefersLight ? "light" : "dark";
}

export function useTheme(theme: ThemePreset, fontFamily: FontFamilyId): void {
  // (1) Theme preset attribute. While `system` is active, keep it in sync
  // with the OS scheme.
  useEffect(() => {
    const html = document.documentElement;
    const apply = () => html.setAttribute("data-theme", resolve(theme));
    apply();
    if (theme !== "system") return;
    const mq = globalThis.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // (2) Font family stack.
  useEffect(() => {
    const family = FONT_FAMILIES.find((f) => f.id === fontFamily);
    if (!family) return;
    document.documentElement.style.setProperty(
      "--app-font-family",
      family.stack,
    );
  }, [fontFamily]);
}
