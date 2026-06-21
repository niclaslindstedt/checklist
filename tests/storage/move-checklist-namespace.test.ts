// @vitest-environment jsdom
// Coverage for the cross-namespace move in `useStorageBackend`: dragging a
// checklist onto another namespace row writes the list into that namespace's
// document (the source removal is the caller's job, in App). Drives the hook
// on the browser backend so the target document can be read back from
// localStorage.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createChecklist } from "../../src/domain/checklists.ts";
import { BrowserLocalStorageAdapter } from "../../src/storage/local/index.ts";
import { DEFAULT_NAMESPACE_SLUG } from "../../src/storage/namespaces.ts";
import { parse } from "../../src/storage/serialize.ts";
import { useStorageBackend } from "../../src/storage/useStorageBackend.ts";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

/** Read the document persisted for `slug` in the browser backend. */
async function docFor(slug: string) {
  const stored = await new BrowserLocalStorageAdapter(
    localStorage,
    slug,
  ).load();
  return parse(stored?.text ?? null);
}

describe("useStorageBackend.moveChecklistToNamespace", () => {
  it("writes the checklist into the target namespace's document", async () => {
    const { result } = renderHook(() => useStorageBackend());
    await act(async () => {});

    // Make a second namespace, then switch back so it's the move *target*.
    act(() => result.current.createNamespace("Work"));
    await waitFor(() => expect(result.current.namespaces).toHaveLength(2));
    const work = result.current.namespaces.find(
      (n) => n.slug !== DEFAULT_NAMESPACE_SLUG,
    )!.slug;
    act(() => result.current.switchNamespace(DEFAULT_NAMESPACE_SLUG));
    await waitFor(() =>
      expect(result.current.activeNamespace).toBe(DEFAULT_NAMESPACE_SLUG),
    );

    const list = createChecklist("c1", "Recipes", "2026-01-01T00:00:00.000Z");
    let ok = false;
    await act(async () => {
      ok = await result.current.moveChecklistToNamespace(list, work);
    });
    expect(ok).toBe(true);

    const target = await docFor(work);
    expect(target.checklists.map((c) => c.id)).toContain("c1");
    expect(target.checklists.find((c) => c.id === "c1")!.name).toBe("Recipes");
  });

  it("drops the source folder link on the way over", async () => {
    const { result } = renderHook(() => useStorageBackend());
    await act(async () => {});
    act(() => result.current.createNamespace("Work"));
    await waitFor(() => expect(result.current.namespaces).toHaveLength(2));
    const work = result.current.namespaces.find(
      (n) => n.slug !== DEFAULT_NAMESPACE_SLUG,
    )!.slug;
    act(() => result.current.switchNamespace(DEFAULT_NAMESPACE_SLUG));
    await waitFor(() =>
      expect(result.current.activeNamespace).toBe(DEFAULT_NAMESPACE_SLUG),
    );

    const filed = {
      ...createChecklist("c2", "Filed", "2026-01-01T00:00:00.000Z"),
      folderId: "f-source",
    };
    await act(async () => {
      await result.current.moveChecklistToNamespace(filed, work);
    });

    const moved = (await docFor(work)).checklists.find((c) => c.id === "c2")!;
    expect(moved.folderId).toBeUndefined();
  });

  it("refuses to move into the active namespace", async () => {
    const { result } = renderHook(() => useStorageBackend());
    await act(async () => {});
    const list = createChecklist("c3", "Here", "2026-01-01T00:00:00.000Z");
    let ok = true;
    await act(async () => {
      ok = await result.current.moveChecklistToNamespace(
        list,
        result.current.activeNamespace,
      );
    });
    expect(ok).toBe(false);
  });

  it("refuses an unknown target namespace", async () => {
    const { result } = renderHook(() => useStorageBackend());
    await act(async () => {});
    const list = createChecklist("c4", "Nowhere", "2026-01-01T00:00:00.000Z");
    let ok = true;
    await act(async () => {
      ok = await result.current.moveChecklistToNamespace(list, "ghost-slug");
    });
    expect(ok).toBe(false);
  });
});
