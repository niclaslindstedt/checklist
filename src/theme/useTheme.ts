// Theme engine: a thin adapter over the shared framework's projection hook.
// The projection that paints the user's appearance `Settings` onto `<html>`
// (the `data-theme` attribute, `--app-font-family` / `--app-font-scale`, and
// the inline custom-theme overrides) is owned once by
// `@niclaslindstedt/oss-framework/theme`; this wrapper just maps the app's
// `Settings` shape onto the framework's `ThemeAppearance` so the single call
// site (`src/app/App.tsx`) keeps working unchanged.
//
// The radius / density / border-width pixel maps and the per-effect cleanup
// that used to live here are the framework's responsibility now — see the
// engine's `applyCustomTheme` / `clearCustomTheme`.

import { useApplyTheme } from "@niclaslindstedt/oss-framework/theme";

import type { Settings } from "../settings/types.ts";

export function useTheme(settings: Settings): void {
  useApplyTheme({
    theme: settings.theme,
    fontFamily: settings.fontFamily,
    fontScale: settings.fontScale,
    customTheme: settings.customTheme,
  });
}
