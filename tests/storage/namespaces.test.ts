// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_NAMESPACE_SLUG,
  addNamespace,
  getActiveNamespaceSlug,
  getNamespaces,
  hasLocalOnlyNamespaces,
  mergeNamespaceLists,
  namespaceCloudFolder,
  namespaceLocalKey,
  parseNamespaces,
  removeNamespace,
  renameNamespace,
  serializeNamespaces,
  setActiveNamespaceSlug,
  setNamespaceAppearance,
  slugify,
} from "../../src/storage/namespaces.ts";
import type { Namespace } from "../../src/storage/namespaces.ts";

afterEach(() => {
  localStorage.clear();
});

describe("namespaces registry", () => {
  it("always reports the default namespace, first, on a fresh device", () => {
    const list = getNamespaces();
    expect(list).toHaveLength(1);
    expect(list[0]!.slug).toBe(DEFAULT_NAMESPACE_SLUG);
  });

  it("adds a namespace with a slug derived from the name", () => {
    const created = addNamespace("Family");
    expect(created.slug).toBe("family");
    expect(created.name).toBe("Family");
    expect(getNamespaces().map((n) => n.slug)).toEqual(["default", "family"]);
  });

  it("disambiguates a colliding slug with a numeric suffix", () => {
    addNamespace("Family");
    const second = addNamespace("family");
    expect(second.slug).toBe("family-2");
  });

  it("never lets a custom namespace shadow the reserved default slug", () => {
    const created = addNamespace("Default");
    expect(created.slug).toBe("default-2");
    expect(getNamespaces()[0]!.slug).toBe("default");
  });

  it("renames the display name without changing the slug", () => {
    const created = addNamespace("Family");
    renameNamespace(created.slug, "Relatives");
    const found = getNamespaces().find((n) => n.slug === "family");
    expect(found?.name).toBe("Relatives");
  });

  it("removes a namespace and falls back to default when it was active", () => {
    const created = addNamespace("Family");
    setActiveNamespaceSlug(created.slug);
    expect(getActiveNamespaceSlug()).toBe("family");
    removeNamespace(created.slug);
    expect(getNamespaces().map((n) => n.slug)).toEqual(["default"]);
    expect(getActiveNamespaceSlug()).toBe(DEFAULT_NAMESPACE_SLUG);
  });

  it("refuses to remove the default namespace", () => {
    expect(() => removeNamespace(DEFAULT_NAMESPACE_SLUG)).toThrow();
  });

  it("ignores an unknown active slug and falls back to default", () => {
    setActiveNamespaceSlug("ghost");
    expect(getActiveNamespaceSlug()).toBe(DEFAULT_NAMESPACE_SLUG);
  });

  it("rejects an empty name", () => {
    expect(() => addNamespace("   ")).toThrow();
  });
});

describe("namespace appearance", () => {
  it("sets and clears a glyph and colour, keeping the slug and name", () => {
    const created = addNamespace("Family");
    setNamespaceAppearance(created.slug, { glyph: "home", color: "#98c379" });
    let found = getNamespaces().find((n) => n.slug === "family");
    expect(found?.glyph).toBe("home");
    expect(found?.color).toBe("#98c379");
    expect(found?.name).toBe("Family");

    // Clearing the glyph leaves the colour in place.
    setNamespaceAppearance(created.slug, { glyph: null });
    found = getNamespaces().find((n) => n.slug === "family");
    expect(found?.glyph).toBeUndefined();
    expect(found?.color).toBe("#98c379");
  });

  it("persists appearance for the default namespace", () => {
    setNamespaceAppearance(DEFAULT_NAMESPACE_SLUG, { glyph: "list" });
    const found = getNamespaces().find(
      (n) => n.slug === DEFAULT_NAMESPACE_SLUG,
    );
    expect(found?.glyph).toBe("list");
  });

  it("drops a non-string appearance value when reloading a corrupt entry", () => {
    localStorage.setItem(
      "checklist:namespaces",
      JSON.stringify([{ slug: "x", name: "X", glyph: 7 }]),
    );
    // The corrupt entry is rejected wholesale, leaving only the default.
    expect(getNamespaces().map((n) => n.slug)).toEqual([
      DEFAULT_NAMESPACE_SLUG,
    ]);
  });
});

describe("namespace registry sync helpers", () => {
  const family: Namespace = { slug: "family", name: "Family" };
  const work: Namespace = { slug: "work", name: "Work" };
  const def: Namespace = { slug: DEFAULT_NAMESPACE_SLUG, name: "Default" };

  it("round-trips a list through serialize / parse", () => {
    const list = [def, family];
    expect(parseNamespaces(serializeNamespaces(list))).toEqual(list);
  });

  it("parses a missing or corrupt blob down to just the default", () => {
    expect(parseNamespaces(null).map((n) => n.slug)).toEqual([
      DEFAULT_NAMESPACE_SLUG,
    ]);
    expect(parseNamespaces("not json").map((n) => n.slug)).toEqual([
      DEFAULT_NAMESPACE_SLUG,
    ]);
  });

  it("adopts the backend list and uploads this device's local-only ones", () => {
    // New device knows default + work; the cloud holds default + family.
    const local = [def, work];
    const remote = [def, family];
    const merged = mergeNamespaceLists(local, remote);
    expect(merged.map((n) => n.slug)).toEqual(["default", "family", "work"]);
  });

  it("lets the backend win the display name on a shared slug", () => {
    const local: Namespace[] = [def, { slug: "family", name: "Relatives" }];
    const remote: Namespace[] = [def, { slug: "family", name: "Family" }];
    const merged = mergeNamespaceLists(local, remote);
    expect(merged.find((n) => n.slug === "family")?.name).toBe("Family");
  });

  it("flags that a push is needed only when a local-only namespace exists", () => {
    expect(hasLocalOnlyNamespaces([def, work], [def, family])).toBe(true);
    expect(hasLocalOnlyNamespaces([def, family], [def, family])).toBe(false);
    expect(hasLocalOnlyNamespaces([def], [def, family])).toBe(false);
  });
});

describe("namespace location helpers", () => {
  it("keeps the legacy local key for default, suffixes the rest", () => {
    expect(namespaceLocalKey("default")).toBe("checklist:v1");
    expect(namespaceLocalKey("family")).toBe("checklist:v1:family");
  });

  it("maps every namespace (including default) to its own cloud folder", () => {
    expect(namespaceCloudFolder("default")).toBe("default");
    expect(namespaceCloudFolder("family")).toBe("family");
  });

  it("slugifies free text to a folder-safe token", () => {
    expect(slugify("  Grocery  List!! ")).toBe("grocery-list");
    expect(slugify("###")).toBe("");
  });
});
