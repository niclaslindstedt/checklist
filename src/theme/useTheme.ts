// Theme engine: projects the user's appearance `Settings` onto `<html>`
// so the CSS variables in `src/styles/` (and every Tailwind utility that
// resolves through them) follow the picker. Cloned from the budget
// project's `useTheme` + appearance-projection hooks, pared to the
// checklist's slots (no table-spacing).
//
// Independent effects so a font change doesn't rewrite the colour
// overrides (and vice versa):
//
//   1. `data-theme` on `<html>` from `settings.theme`. CSS owns the
//      preset palettes; `custom` is a no-op at the CSS layer — effect
//      (4) writes inline overrides instead. While `system` is active the
//      attribute stays `system` and CSS follows `prefers-color-scheme`.
//   2. `--app-font-family` from the selected webfont stack; non-default
//      families are fetched on demand first (font-display: swap).
//   3. `--app-font-scale` multiplier the body font-size reads.
//   4. Custom-theme overrides: 18 colour vars + radius / density /
//      border-width / reduce-motion. Only written when `theme ===
//      "custom"` so flipping back to a preset cleans every inline value
//      out of the style attribute.

import { useEffect } from "react";

import type { Settings } from "../settings/types.ts";
import { loadFontFamily } from "./fonts.ts";
import {
  COLOR_KEYS,
  COLOR_KEY_TO_CSS_VAR,
  FONT_FAMILIES,
  type BorderWidthPreset,
  type DensityPreset,
  type RadiusPreset,
} from "./themes.ts";

// `radius-sm/md/lg` triples per preset. "md" sits at the historical
// defaults; the others fan out symmetrically.
const RADIUS_PX: Record<RadiusPreset, { sm: string; md: string; lg: string }> =
  {
    none: { sm: "0px", md: "0px", lg: "0px" },
    sm: { sm: "2px", md: "4px", lg: "6px" },
    md: { sm: "4px", md: "6px", lg: "12px" },
    lg: { sm: "6px", md: "10px", lg: "20px" },
  };

// Row padding consumed by the `--density-row-*` vars.
const DENSITY: Record<DensityPreset, { py: string; px: string }> = {
  compact: { py: "0.25rem", px: "0.375rem" },
  comfortable: { py: "0.375rem", px: "0.5rem" },
  spacious: { py: "0.5rem", px: "0.75rem" },
};

const BORDER_WIDTH_PX: Record<BorderWidthPreset, string> = {
  thin: "0.5px",
  normal: "1px",
  bold: "2px",
};

export function useTheme(settings: Settings): void {
  const { theme, fontFamily, fontScale, customTheme } = settings;

  // (1) Theme preset attribute.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [theme]);

  // (2) Font family stack. Non-default families are fetched lazily (the
  // default `mono` is bundled statically); the stack var is set
  // immediately either way so the fallback paints at once and the
  // webfont swaps in when it lands.
  useEffect(() => {
    const family = FONT_FAMILIES.find((f) => f.id === fontFamily);
    if (!family) return;
    void loadFontFamily(fontFamily);
    document.documentElement.style.setProperty(
      "--app-font-family",
      family.stack,
    );
    return () => {
      document.documentElement.style.removeProperty("--app-font-family");
    };
  }, [fontFamily]);

  // (3) UI text-size multiplier.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-scale",
      String(fontScale),
    );
    return () => {
      document.documentElement.style.removeProperty("--app-font-scale");
    };
  }, [fontScale]);

  // (4) Custom theme overrides. Only writes inline vars when the active
  // theme is `"custom"`; otherwise clears any prior overrides so
  // flipping back to a preset leaves a clean style attribute.
  useEffect(() => {
    const html = document.documentElement;
    if (theme !== "custom") {
      for (const k of COLOR_KEYS) {
        html.style.removeProperty(`--${COLOR_KEY_TO_CSS_VAR[k]}`);
      }
      html.style.removeProperty("--radius-sm");
      html.style.removeProperty("--radius-md");
      html.style.removeProperty("--radius-lg");
      html.style.removeProperty("--density-row-py");
      html.style.removeProperty("--density-row-px");
      html.style.removeProperty("--border-width");
      html.removeAttribute("data-reduce-motion");
      return;
    }
    for (const k of COLOR_KEYS) {
      html.style.setProperty(
        `--${COLOR_KEY_TO_CSS_VAR[k]}`,
        customTheme.colors[k],
      );
    }
    const r = RADIUS_PX[customTheme.radius];
    html.style.setProperty("--radius-sm", r.sm);
    html.style.setProperty("--radius-md", r.md);
    html.style.setProperty("--radius-lg", r.lg);
    const d = DENSITY[customTheme.density];
    html.style.setProperty("--density-row-py", d.py);
    html.style.setProperty("--density-row-px", d.px);
    html.style.setProperty(
      "--border-width",
      BORDER_WIDTH_PX[customTheme.borderWidth],
    );
    html.setAttribute(
      "data-reduce-motion",
      customTheme.reduceMotion ? "true" : "false",
    );
  }, [theme, customTheme]);
}
