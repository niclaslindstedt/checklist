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

  it("archives a whole list out of the switcher into the archived set", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const first = result.current.activeChecklistId;
    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const second = result.current.activeChecklistId;

    // Archive the active (second) list — it leaves the switcher, lands in the
    // archived set, and the selection re-points at the surviving active list.
    act(() => result.current.archiveChecklist(second));
    await waitFor(() => expect(result.current.checklists).toHaveLength(1));
    expect(result.current.archivedChecklists.map((l) => l.id)).toEqual([
      second,
    ]);
    expect(result.current.activeChecklistId).toBe(first);
    // Persisted with the flag set.
    const stored = parse(adapter.stored()).checklists.find(
      (c) => c.id === second,
    );
    expect(stored!.archived).toBe(true);
  });

  it("restores an archived list back into the switcher and selects it", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const second = result.current.activeChecklistId;
    act(() => result.current.archiveChecklist(second));
    await waitFor(() =>
      expect(result.current.archivedChecklists).toHaveLength(1),
    );

    act(() => result.current.unarchiveChecklist(second));
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    expect(result.current.archivedChecklists).toHaveLength(0);
    expect(result.current.activeChecklistId).toBe(second);
  });

  it("refuses to archive the last remaining active list", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const only = result.current.activeChecklistId;
    act(() => result.current.archiveChecklist(only));
    expect(result.current.checklists).toHaveLength(1);
    expect(result.current.archivedChecklists).toHaveLength(0);
  });

  it("deletes an archived list without tripping the last-active guard", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const second = result.current.activeChecklistId;
    act(() => result.current.archiveChecklist(second));
    await waitFor(() =>
      expect(result.current.archivedChecklists).toHaveLength(1),
    );

    // Deleting the archived list is allowed — an active list still remains.
    act(() => result.current.removeChecklist(second));
    await waitFor(() =>
      expect(result.current.archivedChecklists).toHaveLength(0),
    );
    expect(parse(adapter.stored()).checklists).toHaveLength(1);
  });

  it("ignores a blank rename", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    const id = result.current.activeChecklistId;
    act(() => result.current.renameChecklist(id, "   "));
    expect(result.current.checklists[0]!.name).toBe("Checklist");
  });

  it("detaches a moved list from this namespace's document", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const first = result.current.activeChecklistId;
    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const second = result.current.activeChecklistId;

    // Detach the active (second) list — it left for another namespace, so it
    // drops out of this document and the selection re-points at the survivor.
    act(() => result.current.detachChecklistToNamespace(second, "Work"));
    await waitFor(() => expect(result.current.checklists).toHaveLength(1));
    expect(result.current.activeChecklistId).toBe(first);
    expect(parse(adapter.stored()).checklists).toHaveLength(1);

    // Recoverable via undo (the target-namespace copy is left in place).
    act(() => result.current.undo());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
  });

  it("refuses to detach the last remaining active list", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    const only = result.current.activeChecklistId;
    act(() => result.current.detachChecklistToNamespace(only, "Work"));
    expect(result.current.checklists).toHaveLength(1);
    expect(result.current.activeChecklistId).toBe(only);
  });
});

describe("useChecklist folder verbs", () => {
  it("creates, renames, and persists a folder", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    act(() => result.current.createFolder("Work"));
    await waitFor(() => expect(result.current.folders).toHaveLength(1));
    const folderId = result.current.folders[0]!.id;
    expect(result.current.folders[0]!.name).toBe("Work");
    expect(parse(adapter.stored()).folders).toHaveLength(1);

    act(() => result.current.renameFolder(folderId, "Office"));
    await waitFor(() => expect(result.current.folders[0]!.name).toBe("Office"));
  });

  it("files a checklist into a folder and counts it", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    const listId = result.current.activeChecklistId;

    act(() => result.current.createFolder("Work"));
    await waitFor(() => expect(result.current.folders).toHaveLength(1));
    const folderId = result.current.folders[0]!.id;

    act(() => result.current.moveChecklistToFolder(listId, folderId));
    await waitFor(() => expect(result.current.folders[0]!.count).toBe(1));
    expect(result.current.checklists[0]!.folderId).toBe(folderId);
    expect(parse(adapter.stored()).checklists[0]!.folderId).toBe(folderId);

    // Moving it back out drops the count and clears the link.
    act(() => result.current.moveChecklistToFolder(listId, null));
    await waitFor(() => expect(result.current.folders[0]!.count).toBe(0));
    expect(result.current.checklists[0]!.folderId).toBeUndefined();
  });

  it("adds a new list already filed inside a folder, and selects it", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});

    act(() => result.current.createFolder("Work"));
    await waitFor(() => expect(result.current.folders).toHaveLength(1));
    const folderId = result.current.folders[0]!.id;

    act(() => result.current.addChecklistInFolder(folderId));
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const created = result.current.checklists.find(
      (c) => c.folderId === folderId,
    );
    expect(created).toBeTruthy();
    expect(result.current.activeChecklistId).toBe(created!.id);
  });

  it("removes a folder but keeps its lists, ungrouping them", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    const listId = result.current.activeChecklistId;

    act(() => result.current.createFolder("Work"));
    await waitFor(() => expect(result.current.folders).toHaveLength(1));
    const folderId = result.current.folders[0]!.id;
    act(() => result.current.moveChecklistToFolder(listId, folderId));
    await waitFor(() => expect(result.current.folders[0]!.count).toBe(1));

    act(() => result.current.removeFolder(folderId));
    await waitFor(() => expect(result.current.folders).toHaveLength(0));
    // The list survives, now ungrouped.
    expect(result.current.checklists).toHaveLength(1);
    expect(result.current.checklists[0]!.folderId).toBeUndefined();
  });
});
