// Plaintext mirror of the active language in localStorage, so the shell
// can render in the right language from first paint without reading the
// (pluggable) storage backend. Language preference is not sensitive.
// Mirrors budget's `language-preference.ts`; the key follows the
// `checklist:settings:*` convention used by the theme engine.

import { detectInitialLanguage, type Lang } from "./locale";

const KEY = "checklist:settings:language";

// Broadcast a runtime language switch. `LanguageRoot` listens, loads the
// target catalog, then flips the context. Kept as a window event (rather
// than a shared store) so any future settings UI can switch language
// without importing the root.
export const LANGUAGE_EVENT = "checklist:language";

export function readLanguagePreference(): Lang {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "sv" || raw === "en") return raw;
  } catch {
    // localStorage may throw under private-mode quotas / sandboxed
    // iframes — fall through to detection.
  }
  return detectInitialLanguage();
}

export function writeLanguagePreference(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Silent: the mirror is a UX nicety, not the source of truth.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<Lang>(LANGUAGE_EVENT, { detail: lang }),
    );
  }
}
