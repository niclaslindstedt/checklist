import { describe, expect, it } from "vitest";

import {
  detectInitialLanguage,
  ensureCatalog,
  isCatalogLoaded,
  tFor,
} from "../../src/i18n/index.ts";

describe("i18n runtime", () => {
  it("resolves an English key", () => {
    expect(tFor("en", "pwa.updateAction")).toBe("Update");
  });

  it("interpolates {name}-style params", () => {
    expect(tFor("en", "pwa.updateVersion", { version: "1.2.3" })).toBe(
      "v1.2.3",
    );
  });

  it("returns the key itself for an unknown lookup", () => {
    // `as never` — the key is intentionally outside the typed catalog.
    expect(tFor("en", "nope.missing" as never)).toBe("nope.missing");
  });

  it("falls back to English before a code-split catalog is resident", () => {
    expect(isCatalogLoaded("sv")).toBe(false);
    // sv not loaded yet → English fallback rather than the key.
    expect(tFor("sv", "pwa.updateAction")).toBe("Update");
  });

  it("serves Swedish strings once the catalog is loaded", async () => {
    await ensureCatalog("sv");
    expect(isCatalogLoaded("sv")).toBe(true);
    expect(tFor("sv", "pwa.updateAction")).toBe("Uppdatera");
  });
});

describe("detectInitialLanguage", () => {
  it("returns a supported language code", () => {
    expect(["en", "sv"]).toContain(detectInitialLanguage());
  });
});
