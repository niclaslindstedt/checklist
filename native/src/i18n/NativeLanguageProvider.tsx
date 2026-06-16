// Native counterpart of src/i18n/LanguageRoot.tsx. The web root also mounts
// the DOM toast stack and the PWA update prompt; the native app needs only
// the language context, so this wrapper just resolves the initial language's
// catalog and provides it through the shared `LanguageProvider`.

import { useEffect, useState, type ReactNode } from "react";

import {
  LanguageProvider,
  detectInitialLanguage,
  ensureCatalog,
  isCatalogLoaded,
  type Lang,
} from "../../../src/i18n";

export function NativeLanguageProvider({ children }: { children: ReactNode }) {
  // `detectInitialLanguage` reads `navigator` behind a guard; on React
  // Native that's undefined, so it falls back to English (resident
  // synchronously, so the gate below never blocks for English users).
  const [lang] = useState<Lang>(() => detectInitialLanguage());
  const [booted, setBooted] = useState<boolean>(() => isCatalogLoaded(lang));

  useEffect(() => {
    if (isCatalogLoaded(lang)) {
      setBooted(true);
      return;
    }
    let cancelled = false;
    void ensureCatalog(lang).then(() => {
      if (!cancelled) setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  if (!booted) return null;
  return <LanguageProvider value={lang}>{children}</LanguageProvider>;
}
