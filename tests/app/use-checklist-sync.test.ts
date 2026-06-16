// @vitest-environment jsdom
// Regression coverage for the persistence engine extracted from
// `use-checklist.ts` into `use-checklist-sync.ts`. The save / undo /
// reload plumbing had no automated coverage before this hook was split
// out; the construction cycle between the sync engine and the undo
// timeline (broken with the `resetHistory` ref) is the part most worth
// guarding. Driven through the public `useChecklist` composer against an
// in-memory adapter.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { addItem, createChecklist } from "../../src/domain/checklists.ts";
import { emptySnapshot } from "../../src/domain/types.ts";
import { useChecklist } from "../../src/app/use-checklist.ts";
import {
  ConflictError,
  type StorageAdapter,
  type StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

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

describe("useChecklist save / undo / reload cycle", () => {
  it("edits persist, undo reverts and persists, reload reads back", async () => {
    const adapter = memoryAdapter();
    const { result } = renderHook(() => useChecklist(adapter));

    // Let the mount load() settle (it seeds the default empty list) before
    // editing, so it can't race-wipe the edits below.
    await act(async () => {});

    act(() => result.current.addItem("first"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(adapter.stored()).not.toBeNull();
    expect(parse(adapter.stored()).checklists[0]!.items[0]!.title).toBe(
      "first",
    );

    act(() => result.current.addItem("second"));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    // Undo must revert in-memory AND persist — the applyHistorySnapshot path
    // that threads the sync engine's setDoc + scheduleSave through the
    // timeline's setData callback.
    act(() => result.current.undo());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(parse(adapter.stored()).checklists[0]!.items).toHaveLength(1);
    expect(result.current.canRedo).toBe(true);

    // Reload reads the backend back and resets the timeline through the
    // resetHistory ref the composer wires into the sync engine.
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("surfaces a conflict and resolves it by adopting the remote", async () => {
    // The remote document another device will have pushed by the time the
    // local edit tries to save.
    let remote = createChecklist(
      "remote-list",
      "Remote",
      "2026-01-01T00:00:00.000Z",
    );
    remote = addItem(
      remote,
      { id: "x", title: "remote item" },
      "2026-01-01T00:00:00.000Z",
      "bottom",
    );
    const remoteText = serialize({ ...emptySnapshot(), checklists: [remote] });

    // A cloud-style adapter that rejects a save based on a stale revision,
    // carrying the newer remote bytes on the ConflictError.
    let serverText = serialize(emptySnapshot());
    let serverRev = "r1";
    const conflictAdapter: StorageAdapter = {
      id: "gdrive",
      label: "mem-cloud",
      capabilities: new Set(),
      load: async (): Promise<StoredSnapshot | null> => ({
        text: serverText,
        revision: serverRev,
      }),
      save: async (next: string, baseRevision?: string) => {
        if (baseRevision !== serverRev) {
          throw new ConflictError({ text: serverText, revision: serverRev });
        }
        serverText = next;
        serverRev = "r-saved";
        return { text: serverText, revision: serverRev };
      },
      saveDebounceMs: 0,
    };

    const { result } = renderHook(() => useChecklist(conflictAdapter));
    // Settle the mount load; the client now bases on revision "r1".
    await act(async () => {});

    // Another device pushes the remote forward before the local edit saves.
    serverText = remoteText;
    serverRev = "r2";

    act(() => result.current.addItem("local item"));
    await waitFor(() => expect(result.current.conflict).not.toBeNull());
    expect(result.current.status).toBe("conflict");

    act(() => result.current.resolveConflict("remote"));
    await waitFor(() => expect(result.current.conflict).toBeNull());
    expect(result.current.items.map((i) => i.title)).toEqual(["remote item"]);
    // Adopting the remote makes it the new baseline — history is reset.
    expect(result.current.canUndo).toBe(false);
  });
});
