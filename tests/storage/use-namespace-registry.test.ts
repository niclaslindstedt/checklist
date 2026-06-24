// @vitest-environment jsdom
// Direct coverage for `useNamespaceRegistry`, peeled out of `useStorageBackend`
// so the read→setState→push CRUD dance and the boot reconcile are testable
// against a mocked `NamespaceRegistryStore` instead of a live cloud backend.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NamespaceRegistryStore } from "../../src/storage/namespace-store.ts";
import {
  DEFAULT_NAMESPACE_SLUG,
  type Namespace,
  serializeNamespaces,
} from "../../src/storage/namespaces.ts";
import { useNamespaceRegistry } from "../../src/storage/useNamespaceRegistry.ts";

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

/** A store that records every save and serves a fixed remote payload on load. */
function mockStore(remote: string | null = null): {
  store: NamespaceRegistryStore;
  saves: string[];
} {
  const saves: string[] = [];
  return {
    saves,
    store: {
      load: () => Promise.resolve(remote),
      save: (text) => {
        saves.push(text);
        return Promise.resolve();
      },
    },
  };
}

/** The latest list a store was asked to persist, decoded back to objects. */
function lastSaved(saves: string[]): Namespace[] {
  const text = saves.at(-1);
  if (text === undefined) throw new Error("no save recorded");
  return JSON.parse(text) as Namespace[];
}

describe("useNamespaceRegistry", () => {
  it("starts from the device registry (default only)", () => {
    const { result } = renderHook(() => useNamespaceRegistry(null));
    expect(result.current.namespaces).toHaveLength(1);
    expect(result.current.namespaces[0]?.slug).toBe(DEFAULT_NAMESPACE_SLUG);
  });

  it("add creates a namespace, persists it, and returns the entry", async () => {
    const { store, saves } = mockStore();
    const { result } = renderHook(() => useNamespaceRegistry(store));
    // The boot reconcile seeds the empty remote from the local list first.
    await waitFor(() => expect(saves.length).toBeGreaterThan(0));

    let created: Namespace | undefined;
    act(() => {
      created = result.current.add("Work");
    });

    expect(created?.name).toBe("Work");
    expect(result.current.namespaces).toHaveLength(2);
    expect(result.current.namespaces.map((n) => n.name)).toContain("Work");
    // The mutation is mirrored into the backend store.
    expect(lastSaved(saves).map((n) => n.name)).toContain("Work");
  });

  it("add applies the appearance picked at creation time", () => {
    const { result } = renderHook(() => useNamespaceRegistry(null));
    let created: Namespace | undefined;
    act(() => {
      created = result.current.add("Home", { glyph: "house", color: "#f00" });
    });
    const stored = result.current.namespaces.find(
      (n) => n.slug === created?.slug,
    );
    expect(stored?.glyph).toBe("house");
    expect(stored?.color).toBe("#f00");
  });

  it("rename changes the display name and persists", () => {
    const { store, saves } = mockStore();
    const { result } = renderHook(() => useNamespaceRegistry(store));
    let slug = "";
    act(() => {
      slug = result.current.add("Old").slug;
    });
    act(() => result.current.rename(slug, "New"));

    expect(result.current.namespaces.find((n) => n.slug === slug)?.name).toBe(
      "New",
    );
    expect(lastSaved(saves).find((n) => n.slug === slug)?.name).toBe("New");
  });

  it("setAppearance updates the icon / colour and persists", () => {
    const { store, saves } = mockStore();
    const { result } = renderHook(() => useNamespaceRegistry(store));
    let slug = "";
    act(() => {
      slug = result.current.add("Plain").slug;
    });
    act(() => result.current.setAppearance(slug, { glyph: "star" }));

    expect(result.current.namespaces.find((n) => n.slug === slug)?.glyph).toBe(
      "star",
    );
    expect(lastSaved(saves).find((n) => n.slug === slug)?.glyph).toBe("star");
  });

  it("remove drops the registry entry and persists", () => {
    const { store, saves } = mockStore();
    const { result } = renderHook(() => useNamespaceRegistry(store));
    let slug = "";
    act(() => {
      slug = result.current.add("Temp").slug;
    });
    expect(result.current.namespaces).toHaveLength(2);

    act(() => result.current.remove(slug));
    expect(result.current.namespaces).toHaveLength(1);
    expect(lastSaved(saves).some((n) => n.slug === slug)).toBe(false);
  });

  it("seeds a missing remote registry from the local list on mount", async () => {
    const { store, saves } = mockStore(null);
    renderHook(() => useNamespaceRegistry(store));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(lastSaved(saves).map((n) => n.slug)).toEqual([
      DEFAULT_NAMESPACE_SLUG,
    ]);
  });

  it("merges the backend registry into local state on mount", async () => {
    const remote = serializeNamespaces([
      { slug: DEFAULT_NAMESPACE_SLUG, name: "Default" },
      { slug: "shared", name: "Shared" },
    ]);
    const { store } = mockStore(remote);
    const { result } = renderHook(() => useNamespaceRegistry(store));

    await waitFor(() =>
      expect(result.current.namespaces.map((n) => n.slug)).toContain("shared"),
    );
  });

  it("does not persist on the browser backend (no store)", () => {
    const { result } = renderHook(() => useNamespaceRegistry(null));
    // No throw and state still updates even with a null store.
    act(() => result.current.add("Local-only"));
    expect(result.current.namespaces.map((n) => n.name)).toContain(
      "Local-only",
    );
  });
});
