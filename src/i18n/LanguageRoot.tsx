// Top-level language + chrome wrapper, mounted from `main.tsx`. Ported
// from budget. Lives in its own file (rather than inline in `main.tsx`)
// so React Fast Refresh has a stable boundary. Provides the active
// language to the tree, mounts the shared `ToastProvider` so `useToast()`
// resolves everywhere, and renders the `UpdateToast` prompt on top.

import { useEffect, useState, type ReactNode } from "react";

import { UpdateToast } from "../ui/UpdateToast.tsx";
import { ToastProvider } from "../ui/toast/Toast.tsx";

import {
  LanguageProvider,
  ensureCatalog,
  isCatalogLoaded,
  type Lang,
} from "./index.ts";
import {
  LANGUAGE_EVENT,
  readLanguagePreference,
} from "./language-preference.ts";

export function LanguageRoot({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => readLanguagePreference());
  // Gate the first paint until the initial language's catalog is
  // resident, so a returning non-English user never sees a flash of
  // English. English is resident synchronously, so English users never
  // gate.
  const [booted, setBooted] = useState<boolean>(() => isCatalogLoaded(lang));

  useEffect(() => {
    // Apply a language switch only once its catalog is resident. Flipping
    // the context to a not-yet-loaded language would render the English
    // fallback and leave it stuck there (the context value wouldn't
    // change again when the catalog later arrives). Loading first means
    // the single context change already has the real strings.
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail !== "en" && detail !== "sv") return;
      void ensureCatalog(detail).then(() => setLang(detail));
    };
    window.addEventListener(LANGUAGE_EVENT, onChange);
    return () => window.removeEventListener(LANGUAGE_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (isCatalogLoaded(lang)) {
      setBooted(true);
      return;
    }
    // Only reached for a returning non-English user on first paint —
    // load the persisted language's catalog, then unblock the render.
    let cancelled = false;
    void ensureCatalog(lang).then(() => {
      if (!cancelled) setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return (
    <LanguageProvider value={lang}>
      <ToastProvider>
        {booted ? children : null}
        <UpdateToast />
      </ToastProvider>
    </LanguageProvider>
  );
}
