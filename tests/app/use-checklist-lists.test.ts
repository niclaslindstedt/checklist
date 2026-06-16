// @vitest-environment jsdom
// Coverage for the checklist-collection verbs (use-checklist-lists.ts)
// wired through the public `useChecklist` composer: adding a default-named
// list, switching the active selection, and renaming. Uses an in-memory
// adapter so the persisted bytes can be read back.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useChecklist } from "../../src/app/use-checklist.ts";
import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { parse } from "../../src/storage/serialize.ts";

function memoryAdapter(): StorageAdapter & { stored: () => string | null } {
  let text: string | null = null;
  let rev = 0;
  return {
    id: "browser",
    label: "mem",
    capabilities: new Set(["loadSync"]),
    loadSync: () => (text === null ? null : { text, revision: String(rev) }),
    load: async (): Promise<StoredSnapshot | null> =>
      text === null ? null : { text, revision: String(rev) },
    save: async (next: string) => {
      text = next;
      rev += 1;
      return { text, revision: String(rev) };
    },
    saveDebounceMs: 0,
    stored: () => text,
  };
}

describe("useChecklist multi-list verbs", () => {
  it("seeds a single default-named active list", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    expect(result.current.checklists).toHaveLength(1);
    expect(result.current.checklists[0]!.name).toBe("Checklist");
    expect(result.current.activeChecklistId).toBe(
      result.current.checklists[0]!.id,
    );
  });

  it("adds and switches to a new list, numbering past the default", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));

    const names = result.current.checklists.map((c) => c.name);
    expect(names).toEqual(["Checklist", "Checklist 2"]);
    // The new list becomes active immediately.
    expect(result.current.activeChecklistId).toBe(
      result.current.checklists[1]!.id,
    );
    // Persisted, not just in memory.
    expect(parse(adapter.stored()).checklists).toHaveLength(2);
  });

  it("keeps edits scoped to the active list", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const first = result.current.activeChecklistId;
    act(() => result.current.addItem("milk"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    // The fresh list starts empty.
    expect(result.current.items).toHaveLength(0);

    // Switch back; the first list's item is still there.
    act(() => result.current.selectChecklist(first));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]!.title).toBe("milk");
  });

  it("renames the active list and persists the new name", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const id = result.current.activeChecklistId;
    act(() => result.current.renameChecklist(id, "Groceries"));
    await waitFor(() =>
      expect(result.current.checklists[0]!.name).toBe("Groceries"),
    );
    expect(parse(adapter.stored()).checklists[0]!.name).toBe("Groceries");
  });

  it("removes a list and re-points the active selection at a survivor", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const first = result.current.activeChecklistId;
    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const second = result.current.activeChecklistId;
    expect(second).not.toBe(first);

    // Remove the active (second) list; the selection falls back to the first.
    act(() => result.current.removeChecklist(second));
    await waitFor(() => expect(result.current.checklists).toHaveLength(1));
    expect(result.current.activeChecklistId).toBe(first);
    expect(parse(adapter.stored()).checklists).toHaveLength(1);
  });

  it("refuses to remove the last remaining list", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const only = result.current.activeChecklistId;
    act(() => result.current.removeChecklist(only));
    expect(result.current.checklists).toHaveLength(1);
    expect(result.current.activeChecklistId).toBe(only);
  });

  it("restores a removed list via undo", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const second = result.current.activeChecklistId;

    act(() => result.current.removeChecklist(second));
    await waitFor(() => expect(result.current.checklists).toHaveLength(1));

    act(() => result.current.undo());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
  });

  it("aggregates the archive across lists and restores into the source list", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    // Archive an item in the first list.
    const first = result.current.activeChecklistId;
    act(() => result.current.addItem("milk"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const milkId = result.current.items[0]!.id;
    act(() => result.current.archive(milkId));
    await waitFor(() => expect(result.current.items).toHaveLength(0));

    // Switch to a second list and archive an item there too.
    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    act(() => result.current.addItem("eggs"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const eggsId = result.current.items[0]!.id;
    act(() => result.current.archive(eggsId));
    await waitFor(() => expect(result.current.items).toHaveLength(0));

    // The archive spans both lists, grouped by source.
    expect(
      result.current.archivedGroups.map((g) => g.items.map((it) => it.id)),
    ).toEqual([[milkId], [eggsId]]);

    // Restoring the first list's item reaches into it even though the second
    // list is active, leaving the active list's view untouched.
    act(() => result.current.unarchive(milkId));
    await waitFor(() => expect(result.current.archivedGroups).toHaveLength(1));
    expect(result.current.items).toHaveLength(0); // second list still empty
    act(() => result.current.selectChecklist(first));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]!.title).toBe("milk");
  });

  it("counts each list's not-yet-completed items in the summary", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    // A fresh list has nothing outstanding.
    expect(result.current.checklists[0]!.remaining).toBe(0);

    act(() => result.current.addItem("milk"));
    act(() => result.current.addItem("eggs"));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.checklists[0]!.remaining).toBe(2);

    // Checking an item drops it from the count.
    const milkId = result.current.items.find((it) => it.title === "milk")!.id;
    act(() => result.current.toggle(milkId));
    await waitFor(() =>
      expect(result.current.checklists[0]!.remaining).toBe(1),
    );

    // Archiving the other (still-unchecked) item drops it too — archived
    // items are not part of the active count.
    const eggsId = result.current.items.find((it) => it.title === "eggs")!.id;
    act(() => result.current.archive(eggsId));
    await waitFor(() =>
      expect(result.current.checklists[0]!.remaining).toBe(0),
    );
  });

  it("ignores a blank rename", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    const id = result.current.activeChecklistId;
    act(() => result.current.renameChecklist(id, "   "));
    expect(result.current.checklists[0]!.name).toBe("Checklist");
  });
});
