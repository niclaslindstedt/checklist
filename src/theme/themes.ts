// Theme data: the presets the engine can apply, the bundled font stacks,
// and the Custom-theme palettes / defaults. Cloned from the budget
// project's `data/themes.ts` (the checklist and budget apps share a
// look), pared to what a plain checklist needs — the month-wheel colours
// and the table-spacing preset are budget-only and don't appear here.
//
// CSS owns the actual palette rules for the non-custom presets (see
// `src/styles/palettes.css`); this module is the source of truth for
// which theme ids and font families are valid and supplies the palettes
// the Custom-theme editor seeds from. Read by the Appearance tab,
// `useTheme`, and the settings store's validator.

// Theme preset. `dark` / `light` lock to the One Dark / One Light
// palettes; `dracula`, `monokai`, `githubDark`, `githubLight`,
// `solarizedLight`, and `quietLight` are the popular editor themes
// adapted to the slot vocabulary; `excel` mirrors Excel's light look;
// `system` follows `prefers-color-scheme`; `custom` applies the user's
// colour and shape overrides held under `Settings.customTheme`. The
// runtime writes the active value to `data-theme` on `<html>`.
export type ThemePreset =
  | "dark"
  | "light"
  | "dracula"
  | "monokai"
  | "githubDark"
  | "githubLight"
  | "solarizedLight"
  | "quietLight"
  | "excel"
  | "system"
  | "custom";

// Allowed theme presets, in the order the Appearance picker shows them.
// Source of truth for the validator and the picker UI. Dark variants
// first, then light variants, then the two non-coloured presets.
export const THEMES = [
  "dark",
  "light",
  "dracula",
  "monokai",
  "githubDark",
  "githubLight",
  "solarizedLight",
  "quietLight",
  "excel",
  "system",
  "custom",
] as const;

// Dark is the default until the user picks otherwise.
export const DEFAULT_THEME: ThemePreset = "dark";

// Theme presets in the Dark family, in variant-row order (One Dark
// first). The Appearance picker derives the selected family from the
// active preset and renders the matching array as the variant row.
export const DARK_THEMES = [
  "dark",
  "dracula",
  "monokai",
  "githubDark",
] as const;

// Theme presets in the Light family — One Light first, then the light
// editor variants, then the Excel-flavoured light theme.
export const LIGHT_THEMES = [
  "light",
  "githubLight",
  "solarizedLight",
  "quietLight",
  "excel",
] as const;

// Broad colour-scheme family a preset belongs to. The picker's mode row
// selects the family (Dark / Light / System / Custom); a variant row
// appears underneath for the Dark / Light families.
export type ThemeFamily = "dark" | "light" | "system" | "custom";

// Resolve a preset to its broad family. Dark / Light variants fold into
// their bucket; `system` and `custom` are their own families.
export function themeFamily(preset: ThemePreset): ThemeFamily {
  if ((DARK_THEMES as readonly string[]).includes(preset)) return "dark";
  if ((LIGHT_THEMES as readonly string[]).includes(preset)) return "light";
  return preset as "system" | "custom";
}

// Default preset for each family — what the mode row jumps to when the
// user picks a family they weren't already in.
export const FAMILY_DEFAULT_THEME: Record<ThemeFamily, ThemePreset> = {
  dark: "dark",
  light: "light",
  system: "system",
  custom: "custom",
};

// Bundled webfont families the body reads through `--app-font-family`.
// Monospace is the default — the UI is deliberately reminiscent of a
// plain-text editor. The other three load on demand (see
// `src/theme/fonts.ts`). `stack` is the full CSS `font-family` value.
export type FontFamilyId = "mono" | "sans" | "serif" | "dyslexic";

export const FONT_FAMILIES: readonly {
  id: FontFamilyId;
  label: string;
  stack: string;
}[] = [
  {
    id: "mono",
    label: "Monospace",
    stack:
      '"JetBrains Mono", "Fira Code", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "sans",
    label: "Sans-serif",
    stack:
      '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack: '"Source Serif 4", ui-serif, Georgia, "Times New Roman", serif',
  },
  {
    id: "dyslexic",
    label: "OpenDyslexic",
    stack:
      '"OpenDyslexic", "Comic Sans MS", ui-sans-serif, system-ui, sans-serif',
  },
];

export const DEFAULT_FONT_FAMILY: FontFamilyId = "mono";

// Discrete UI text-size multipliers offered by the Appearance tab. The
// body's `font-size` multiplies by `--app-font-scale`, so every rem
// dimension downstream picks up the chosen step.
export const FONT_SCALE_PRESETS: readonly {
  scale: number;
  label: string;
}[] = [
  { scale: 0.9, label: "Small (90%)" },
  { scale: 1, label: "Default (100%)" },
  { scale: 1.1, label: "Large (110%)" },
  { scale: 1.25, label: "Extra large (125%)" },
];

export const MIN_FONT_SCALE = 0.9;
export const MAX_FONT_SCALE = 1.25;
export const DEFAULT_FONT_SCALE = 1;

export type RadiusPreset = "none" | "sm" | "md" | "lg";
export type DensityPreset = "compact" | "comfortable" | "spacious";
export type BorderWidthPreset = "thin" | "normal" | "bold";

export const RADIUS_PRESETS: readonly RadiusPreset[] = [
  "none",
  "sm",
  "md",
  "lg",
];
export const DENSITY_PRESETS: readonly DensityPreset[] = [
  "compact",
  "comfortable",
  "spacious",
];
export const BORDER_WIDTH_PRESETS: readonly BorderWidthPreset[] = [
  "thin",
  "normal",
  "bold",
];

// Per-slot custom colours — one field per CSS variable the chrome reads.
// The runtime maps each key to its `--<slug>` CSS var on `<html>` when
// the active theme is `custom`.
export type CustomThemeColors = {
  pageBg: string;
  surface: string;
  surface2: string;
  surface3: string;
  fg: string;
  fgBright: string;
  muted: string;
  line: string;
  accent: string;
  meta: string;
  link: string;
  path: string;
  flag: string;
  pipe: string;
  danger: string;
  success: string;
  positive: string;
  negative: string;
};

// User-authored theme applied when `Settings.theme === "custom"`. The
// picker re-seeds it from whichever theme is on screen each time the
// user switches into Custom, so the editor opens as a copy of the
// current look and the first edit is a tweak.
export type CustomTheme = {
  colors: CustomThemeColors;
  radius: RadiusPreset;
  density: DensityPreset;
  borderWidth: BorderWidthPreset;
  // Globally short-circuits transition / animation durations via a
  // high-specificity rule keyed off `[data-reduce-motion="true"]`.
  reduceMotion: boolean;
};

// One Dark palette mirrored from `palettes.css`. The Custom theme's
// pristine default and the validator's fallback for a missing colour.
export const DEFAULT_CUSTOM_THEME_COLORS_DARK: CustomThemeColors = {
  pageBg: "#1d2027",
  surface: "#282c34",
  surface2: "#2c313a",
  surface3: "#21252b",
  fg: "#abb2bf",
  fgBright: "#e6e6e6",
  muted: "#9097a8",
  line: "#3e4451",
  accent: "#98c379",
  meta: "#e5c07b",
  link: "#61afef",
  path: "#56b6c2",
  flag: "#d19a66",
  pipe: "#c678dd",
  danger: "#e06c75",
  success: "#98c379",
  positive: "#b5e3a0",
  negative: "#f0b4ba",
};

export const DEFAULT_CUSTOM_THEME_COLORS_LIGHT: CustomThemeColors = {
  pageBg: "#eef0f2",
  surface: "#f8f9fa",
  surface2: "#f1f3f5",
  surface3: "#e4e7eb",
  fg: "#2f323a",
  fgBright: "#15171c",
  muted: "#6a6f7c",
  line: "#ccd0d6",
  accent: "#3f8c3e",
  meta: "#9c6a00",
  link: "#2960c2",
  path: "#0a6e92",
  flag: "#ad4c00",
  pipe: "#872187",
  danger: "#c9434c",
  success: "#3f8c3e",
  positive: "#5fa057",
  negative: "#d77a82",
};

export const DEFAULT_CUSTOM_THEME_COLORS_DRACULA: CustomThemeColors = {
  pageBg: "#21222c",
  surface: "#282a36",
  surface2: "#343746",
  surface3: "#191a21",
  fg: "#f8f8f2",
  fgBright: "#ffffff",
  muted: "#8b93c2",
  line: "#44475a",
  accent: "#50fa7b",
  meta: "#f1fa8c",
  link: "#8be9fd",
  path: "#bd93f9",
  flag: "#ffb86c",
  pipe: "#ff79c6",
  danger: "#ff5555",
  success: "#50fa7b",
  positive: "#a8ffb8",
  negative: "#ffb3c5",
};

export const DEFAULT_CUSTOM_THEME_COLORS_MONOKAI: CustomThemeColors = {
  pageBg: "#1e1f1c",
  surface: "#272822",
  surface2: "#3e3d32",
  surface3: "#1b1c18",
  fg: "#f8f8f2",
  fgBright: "#ffffff",
  muted: "#9c9882",
  line: "#49483e",
  accent: "#a6e22e",
  meta: "#e6db74",
  link: "#66d9ef",
  path: "#66d9ef",
  flag: "#fd971f",
  pipe: "#ae81ff",
  danger: "#f92672",
  success: "#a6e22e",
  positive: "#b6e354",
  negative: "#f49ab1",
};

export const DEFAULT_CUSTOM_THEME_COLORS_GITHUB_DARK: CustomThemeColors = {
  pageBg: "#010409",
  surface: "#0d1117",
  surface2: "#161b22",
  surface3: "#010409",
  fg: "#c9d1d9",
  fgBright: "#f0f6fc",
  muted: "#8b949e",
  line: "#30363d",
  accent: "#7ee787",
  meta: "#d29922",
  link: "#79c0ff",
  path: "#56d4dd",
  flag: "#ffa657",
  pipe: "#d2a8ff",
  danger: "#ff7b72",
  success: "#7ee787",
  positive: "#aff5b4",
  negative: "#ffb8b3",
};

export const DEFAULT_CUSTOM_THEME_COLORS_GITHUB_LIGHT: CustomThemeColors = {
  pageBg: "#f6f8fa",
  surface: "#ffffff",
  surface2: "#eaeef2",
  surface3: "#d0d7de",
  fg: "#1f2328",
  fgBright: "#0d1117",
  muted: "#6e7781",
  line: "#d0d7de",
  accent: "#1a7f37",
  meta: "#9a6700",
  link: "#0969da",
  path: "#0550ae",
  flag: "#bc4c00",
  pipe: "#8250df",
  danger: "#cf222e",
  success: "#1a7f37",
  positive: "#4ac26b",
  negative: "#e5717f",
};

export const DEFAULT_CUSTOM_THEME_COLORS_SOLARIZED_LIGHT: CustomThemeColors = {
  pageBg: "#eee8d5",
  surface: "#fdf6e3",
  surface2: "#f5efdc",
  surface3: "#e3ddc9",
  fg: "#586e75",
  fgBright: "#073642",
  muted: "#657b83",
  line: "#d6cfb8",
  accent: "#859900",
  meta: "#b58900",
  link: "#268bd2",
  path: "#2aa198",
  flag: "#cb4b16",
  pipe: "#6c71c4",
  danger: "#dc322f",
  success: "#859900",
  positive: "#719e00",
  negative: "#d33682",
};

export const DEFAULT_CUSTOM_THEME_COLORS_QUIET_LIGHT: CustomThemeColors = {
  pageBg: "#f5f5f5",
  surface: "#ffffff",
  surface2: "#ebebeb",
  surface3: "#e0e0e0",
  fg: "#333333",
  fgBright: "#1a1a1a",
  muted: "#767676",
  line: "#d4d4d4",
  accent: "#4f894c",
  meta: "#ae6e29",
  link: "#4b83cd",
  path: "#1d8696",
  flag: "#aa6624",
  pipe: "#7e54a5",
  danger: "#b73525",
  success: "#4f894c",
  positive: "#6c9d56",
  negative: "#cf6e6a",
};

export const DEFAULT_CUSTOM_THEME_COLORS_EXCEL: CustomThemeColors = {
  pageBg: "#e6e6e6",
  surface: "#ffffff",
  surface2: "#f3f2f1",
  surface3: "#e1dfdd",
  fg: "#252423",
  fgBright: "#171717",
  muted: "#605e5c",
  line: "#d4d4d4",
  accent: "#217346",
  meta: "#a6730a",
  link: "#0563c1",
  path: "#0e7490",
  flag: "#c55a11",
  pipe: "#7030a0",
  danger: "#c00000",
  success: "#217346",
  positive: "#3f7d3a",
  negative: "#c84031",
};

// Per-preset palette lookup. The picker reads this to draw the
// variant-row swatches and to pre-fill the Custom editor when the user
// switches into Custom.
export const PRESET_PALETTES: Record<
  Exclude<ThemePreset, "system" | "custom">,
  CustomThemeColors
> = {
  dark: DEFAULT_CUSTOM_THEME_COLORS_DARK,
  light: DEFAULT_CUSTOM_THEME_COLORS_LIGHT,
  dracula: DEFAULT_CUSTOM_THEME_COLORS_DRACULA,
  monokai: DEFAULT_CUSTOM_THEME_COLORS_MONOKAI,
  githubDark: DEFAULT_CUSTOM_THEME_COLORS_GITHUB_DARK,
  githubLight: DEFAULT_CUSTOM_THEME_COLORS_GITHUB_LIGHT,
  solarizedLight: DEFAULT_CUSTOM_THEME_COLORS_SOLARIZED_LIGHT,
  quietLight: DEFAULT_CUSTOM_THEME_COLORS_QUIET_LIGHT,
  excel: DEFAULT_CUSTOM_THEME_COLORS_EXCEL,
};

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  colors: DEFAULT_CUSTOM_THEME_COLORS_DARK,
  radius: "md",
  density: "comfortable",
  borderWidth: "normal",
  reduceMotion: false,
};

// Snapshot of the theme currently on screen, used to seed the Custom
// controls when the user switches into Custom so the editor opens as a
// copy of the current look. Colours come from the active preset;
// `system` resolves via the caller-supplied `prefersLight`.
export function customThemeSeed(
  theme: ThemePreset,
  prefersLight: boolean,
): CustomTheme {
  const colors =
    theme === "system"
      ? prefersLight
        ? DEFAULT_CUSTOM_THEME_COLORS_LIGHT
        : DEFAULT_CUSTOM_THEME_COLORS_DARK
      : theme === "custom"
        ? DEFAULT_CUSTOM_THEME_COLORS_DARK
        : PRESET_PALETTES[theme];
  return {
    colors,
    radius: DEFAULT_CUSTOM_THEME.radius,
    density: DEFAULT_CUSTOM_THEME.density,
    borderWidth: DEFAULT_CUSTOM_THEME.borderWidth,
    reduceMotion: DEFAULT_CUSTOM_THEME.reduceMotion,
  };
}

// Ordered list of colour keys. The validator walks every slot; the
// picker uses it via `COLOR_GROUPS` for display order within a group.
export const COLOR_KEYS: readonly (keyof CustomThemeColors)[] = [
  "pageBg",
  "surface",
  "surface2",
  "surface3",
  "fg",
  "fgBright",
  "muted",
  "line",
  "accent",
  "meta",
  "link",
  "path",
  "flag",
  "pipe",
  "danger",
  "success",
  "positive",
  "negative",
];

// Maps each colour key to the CSS-variable slug (the part after `--`)
// the runtime writes when Custom is active.
export const COLOR_KEY_TO_CSS_VAR: Record<keyof CustomThemeColors, string> = {
  pageBg: "page-bg",
  surface: "surface",
  surface2: "surface-2",
  surface3: "surface-3",
  fg: "fg",
  fgBright: "fg-bright",
  muted: "muted",
  line: "line",
  accent: "accent",
  meta: "meta",
  link: "link",
  path: "path",
  flag: "flag",
  pipe: "pipe",
  danger: "danger",
  success: "success",
  positive: "positive",
  negative: "negative",
};

// Human-readable labels for the colour slots, keyed by colour key.
export const COLOR_LABELS: Record<keyof CustomThemeColors, string> = {
  pageBg: "Page background",
  surface: "Surface",
  surface2: "Surface (raised)",
  surface3: "Surface (sunken)",
  fg: "Text",
  fgBright: "Bright text",
  muted: "Muted text",
  line: "Lines",
  accent: "Accent",
  meta: "Meta",
  link: "Link",
  path: "Path",
  flag: "Flag",
  pipe: "Pipe",
  danger: "Danger",
  success: "Success",
  positive: "Positive",
  negative: "Negative",
};

// How the Custom panel groups the 18 colour controls so the section
// stays scannable. `label` heads each group.
export const COLOR_GROUPS: readonly {
  id: "backgrounds" | "text" | "lines" | "accents" | "status";
  label: string;
  keys: readonly (keyof CustomThemeColors)[];
}[] = [
  {
    id: "backgrounds",
    label: "Backgrounds",
    keys: ["pageBg", "surface", "surface2", "surface3"],
  },
  { id: "text", label: "Text", keys: ["fg", "fgBright", "muted"] },
  { id: "lines", label: "Lines", keys: ["line"] },
  {
    id: "accents",
    label: "Accents",
    keys: ["accent", "meta", "link", "path", "flag", "pipe"],
  },
  {
    id: "status",
    label: "Status",
    keys: ["danger", "success", "positive", "negative"],
  },
];

// Display labels for the theme presets and families, used by the picker.
export const THEME_LABELS: Record<ThemePreset, string> = {
  dark: "One Dark",
  light: "One Light",
  dracula: "Dracula",
  monokai: "Monokai",
  githubDark: "GitHub Dark",
  githubLight: "GitHub Light",
  solarizedLight: "Solarized Light",
  quietLight: "Quiet Light",
  excel: "Excel",
  system: "System",
  custom: "Custom",
};

export const FAMILY_LABELS: Record<ThemeFamily, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
  custom: "Custom",
};
