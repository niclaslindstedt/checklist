// Helpers around the app's two-letter language code. Kept tiny and
// standalone (no React, no catalog modules) so non-component callers can
// import it freely. Mirrors budget's `locale.ts`, trimmed to what the
// checklist app needs.

export type Lang = "en" | "sv";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "sv"];

// Map "en" → "en-GB" and "sv" → "sv-SE" so any future Intl formatter
// picks a concrete locale rather than guessing from the browser.
export function bcp47(lang: Lang): string {
  return lang === "sv" ? "sv-SE" : "en-GB";
}

// Consulted only when no preference is stored yet. Anything whose
// `navigator.language` starts with `sv` → Swedish; everything else →
// English.
export function detectInitialLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  const raw = navigator.language ?? "";
  return raw.toLowerCase().startsWith("sv") ? "sv" : "en";
}
