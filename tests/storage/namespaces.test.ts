// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_NAMESPACE_SLUG,
  addNamespace,
  getActiveNamespaceSlug,
  getNamespaces,
  namespaceCloudFolder,
  namespaceLocalKey,
  removeNamespace,
  renameNamespace,
  setActiveNamespaceSlug,
  slugify,
} from "../../src/storage/namespaces.ts";

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
