// @vitest-environment jsdom
// The action confirmations: every checklist mutation whose result the
// user can't immediately see raises a toast through the injected `notify`
// sink, and undo / redo announce the action they stepped past. Drives the
// public `useChecklist` composer with an in-memory adapter and a spy sink.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useChecklist } from "../../src/app/use-checklist.ts";
import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";

function memoryAdapter(): StorageAdapter {
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
  };
}

describe("useChecklist action toasts", () => {
  it("toasts a delete, names the item, and announces the undo", async () => {
    const notify = vi.fn();
    const adapter = memoryAdapter();
    const { result } = renderHook(() =>
      useChecklist(adapter, "bottom", notify),
    );
    await act(async () => {});

    act(() => result.current.addItem("milk"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    // Adding is immediately visible — no toast for it.
    expect(notify).not.toHaveBeenCalled();

    const id = result.current.items[0]!.id;
    act(() => result.current.remove(id));
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(notify).toHaveBeenCalledWith("Deleted “milk”");

    notify.mockClear();
    act(() => result.current.undo());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(notify).toHaveBeenCalledWith("Undone: Deleted “milk”");
  });

  it("toasts archive and restore with a success cue on restore", async () => {
    const notify = vi.fn();
    const adapter = memoryAdapter();
    const { result } = renderHook(() =>
      useChecklist(adapter, "bottom", notify),
    );
    await act(async () => {});

    act(() => result.current.addItem("eggs"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const id = result.current.items[0]!.id;

    act(() => result.current.archive(id));
    await waitFor(() =>
      expect(result.current.archivedGroups[0]?.items).toHaveLength(1),
    );
    expect(notify).toHaveBeenCalledWith("Archived “eggs”");

    notify.mockClear();
    act(() => result.current.unarchive(id));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(notify).toHaveBeenCalledWith("Restored “eggs”", "success");
  });

  it("toasts removing a checklist by name", async () => {
    const notify = vi.fn();
    const adapter = memoryAdapter();
    const { result } = renderHook(() =>
      useChecklist(adapter, "bottom", notify),
    );
    await act(async () => {});

    act(() => result.current.addChecklist());
    await waitFor(() => expect(result.current.checklists).toHaveLength(2));
    const second = result.current.activeChecklistId;
    // Creating a list jumps to it — visible, so no toast.
    expect(notify).not.toHaveBeenCalled();

    act(() => result.current.removeChecklist(second));
    await waitFor(() => expect(result.current.checklists).toHaveLength(1));
    expect(notify).toHaveBeenCalledWith("Deleted list “Checklist 2”");
  });
});
