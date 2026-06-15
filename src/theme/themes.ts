// Theme data: the presets the engine can apply and the bundled font
// stacks. Adapted from the budget project's `data/themes.ts`, pared down
// to what the checklist UI needs today. CSS owns the actual palette rules
// (see `src/styles/palettes.css`); this module is the source of truth for
// which theme ids are valid and which font families exist, shared by the
// engine in `./theme.ts` and any future Appearance picker.

// Theme preset. `dark` / `light` lock to the One Dark / One Light
// palettes; `system` follows `prefers-color-scheme`. The runtime writes
// the resolved value to `data-theme` on `<html>`. More presets can be
// added here and in `palettes.css` without touching the engine.
export type ThemePreset = "dark" | "light" | "system";

// Allowed presets, in the order a future picker would show them.
export const THEMES: readonly ThemePreset[] = ["dark", "light", "system"];

// Dark is the default until there's a UI to choose otherwise.
export const DEFAULT_THEME: ThemePreset = "dark";

// Bundled webfont families the body reads through `--app-font-family`.
// Monospace is the default — the UI is deliberately reminiscent of a
// plain-text editor. `stack` is the full CSS `font-family` value.
export type FontFamilyId = "mono" | "sans";

export const FONT_FAMILIES: readonly {
  id: FontFamilyId;
  stack: string;
}[] = [
  {
    id: "mono",
    stack:
      '"JetBrains Mono", "Fira Code", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "sans",
    stack:
      '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
];

export const DEFAULT_FONT_FAMILY: FontFamilyId = "mono";
