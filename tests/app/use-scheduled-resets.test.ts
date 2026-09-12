// @vitest-environment jsdom
// Coverage for the scheduled pass (use-scheduled-resets.ts) wired through the
// public `useChecklist` composer, for both the things it puts back: a list
// whose reset schedule came due while the app was closed is unchecked once the
// backend load lands (the occurrence stamped and persisted, the pop-up queued
// when asked for, and an undo not re-triggering it), and an item whose repeat
// came round comes back unchecked at the top of its list.
import { act, renderHook, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

import { useChecklist } from "../../src/app/use-checklist.ts";
import { createChecklist } from "../../src/domain/checklists.ts";
import type {
  Checklist,
  ResetSchedule,
  Snapshot,
} from "../../src/domain/types.ts";
import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

function memoryAdapter(
  seed: Snapshot | null,
): StorageAdapter & { stored: () => string | null } {
  let text: string | null = seed ? serialize(seed) : null;
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

/** A daily schedule at local midnight, set two days ago — so today's 00:00 is due. */
function dueSchedule(popUp = false): ResetSchedule {
  const since = new Date();
  since.setDate(since.getDate() - 2);
  return {
    unit: "day",
    interval: 1,
    hour: 0,
    minute: 0,
    popUp,
    since: since.toISOString(),
  };
}

/** A daily schedule set just now, at an hour still ahead — nothing due yet. */
function pendingSchedule(): ResetSchedule {
  const now = new Date();
  return {
    unit: "day",
    interval: 1,
    hour: (now.getHours() + 1) % 24,
    minute: 0,
    popUp: false,
    since: now.toISOString(),
  };
}

function scheduledList(schedule: ResetSchedule, id = "routine"): Checklist {
  return {
    ...createChecklist(id, "Leaving home", "2026-05-01T00:00:00.000Z"),
    items: [
      { id: `${id}-keys`, title: "Keys", checked: true },
      { id: `${id}-bag`, title: "Bag", checked: true },
    ],
    resetSchedule: schedule,
  };
}

/** A list holding a resting refreshing item, due back `hoursAgo` ago. */
function refreshingList(hoursAgo: number, id = "shopping"): Checklist {
  const back = new Date();
  back.setHours(back.getHours() - hoursAgo);
  return {
    ...createChecklist(id, "Shopping", "2026-05-01T00:00:00.000Z"),
    items: [
      { id: "bread", title: "Bread", checked: false },
      {
        id: "milk",
        title: "Milk",
        checked: true,
        checkedAt: "2026-05-01T00:00:00.000Z",
        refreshAt: back.toISOString(),
        recurrence: { unit: "week", interval: 1 },
      },
    ],
  };
}

describe("useChecklist scheduled resets", () => {
  it("unchecks a list whose reset came due, and persists the occurrence", async () => {
    const adapter = memoryAdapter({
      templates: [],
      checklists: [scheduledList(dueSchedule())],
    });
    const notify = vi.fn();
    const { result } = renderHook(() =>
      useChecklist(adapter, "bottom", notify),
    );
    await act(async () => {});

    await waitFor(() =>
      expect(result.current.items.every((it) => !it.checked)).toBe(true),
    );
    const stored = parse(adapter.stored()).checklists[0]!;
    expect(stored.items.every((it) => !it.checked)).toBe(true);
    // The occurrence applied is today's local midnight.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(stored.lastResetAt).toBe(midnight.toISOString());
    expect(notify).toHaveBeenCalledWith("Reset “Leaving home”");
    // Without a pop-up asked for, nothing queues.
    expect(result.current.resetPopupListId).toBeNull();
  });

  it("leaves a list alone when its reset is still ahead", async () => {
    const adapter = memoryAdapter({
      templates: [],
      checklists: [scheduledList(pendingSchedule())],
    });
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    expect(result.current.items.every((it) => it.checked)).toBe(true);
    expect(parse(adapter.stored()).checklists[0]!.lastResetAt).toBeUndefined();
  });

  it("queues the pop-up for a list that asked for it, and dismisses it", async () => {
    const adapter = memoryAdapter({
      templates: [],
      checklists: [scheduledList(dueSchedule(true))],
    });
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    await waitFor(() =>
      expect(result.current.resetPopupListId).toBe("routine"),
    );
    act(() => {
      result.current.dismissResetPopup();
    });
    await waitFor(() => expect(result.current.resetPopupListId).toBeNull());
  });

  it("does not re-apply an occurrence the user has just undone", async () => {
    const adapter = memoryAdapter({
      templates: [],
      checklists: [scheduledList(dueSchedule())],
    });
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    await waitFor(() =>
      expect(result.current.items.every((it) => !it.checked)).toBe(true),
    );
    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.undo();
    });
    await waitFor(() =>
      expect(result.current.items.every((it) => it.checked)).toBe(true),
    );
    // A resume re-checks the document; the restored (older) `lastResetAt`
    // would make the same occurrence look due again, but the session
    // remembers applying it.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.items.every((it) => it.checked)).toBe(true);
  });

  it("brings a due repeating item back, unchecked and at the top", async () => {
    const adapter = memoryAdapter({
      templates: [],
      checklists: [refreshingList(1)],
    });
    const notify = vi.fn();
    renderHook(() => useChecklist(adapter, "bottom", notify));
    await act(async () => {});

    await waitFor(() =>
      expect(parse(adapter.stored()).checklists[0]!.items[0]!.id).toBe("milk"),
    );
    const milk = parse(adapter.stored()).checklists[0]!.items[0]!;
    expect(milk.checked).toBe(false);
    expect(milk.refreshAt).toBeUndefined();
    expect(milk.checkedAt).toBeUndefined();
    // The cadence survives — the item is due again, not done with.
    expect(milk.recurrence).toEqual({ unit: "week", interval: 1 });
    expect(notify).toHaveBeenCalledWith("“Milk” is back on “Shopping”");
  });

  it("leaves a repeating item resting until its moment", async () => {
    const adapter = memoryAdapter({
      templates: [],
      checklists: [refreshingList(-1)],
    });
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    expect(result.current.items.map((it) => it.id)).toEqual(["bread", "milk"]);
    expect(parse(adapter.stored()).checklists[0]!.items[1]!.checked).toBe(true);
  });

  it("does not bring back a repeating item the user has just undone", async () => {
    const adapter = memoryAdapter({
      templates: [],
      checklists: [refreshingList(1)],
    });
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    await waitFor(() =>
      expect(parse(adapter.stored()).checklists[0]!.items[0]!.id).toBe("milk"),
    );
    act(() => {
      result.current.undo();
    });
    await waitFor(() =>
      expect(result.current.items.map((it) => it.id)).toEqual([
        "bread",
        "milk",
      ]),
    );
    // The undo restores the (already-passed) stamp, which would otherwise make
    // the very next check bring the item back again.
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.items.map((it) => it.id)).toEqual(["bread", "milk"]);
  });

  it("puts a list on a schedule, stamping the anchor, and takes it off again", async () => {
    const adapter = memoryAdapter(null);
    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {});
    const id = result.current.activeChecklistId;

    act(() => {
      result.current.setChecklistResetSchedule(id, {
        unit: "week",
        interval: 1,
        hour: 8,
        minute: 0,
        popUp: true,
      });
    });
    await waitFor(() =>
      expect(parse(adapter.stored()).checklists[0]!.resetSchedule).toBeTruthy(),
    );
    const stored = parse(adapter.stored()).checklists[0]!.resetSchedule!;
    expect(stored.unit).toBe("week");
    expect(stored.popUp).toBe(true);
    expect(typeof stored.since).toBe("string");
    expect(result.current.activeList.resetSchedule).toEqual(stored);

    act(() => {
      result.current.setChecklistResetSchedule(id, null);
    });
    await waitFor(() =>
      expect(
        parse(adapter.stored()).checklists[0]!.resetSchedule,
      ).toBeUndefined(),
    );
  });
});
