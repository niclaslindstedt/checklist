// @vitest-environment jsdom
// Regression coverage for the persistence engine extracted from
// `use-checklist.ts` into `use-checklist-sync.ts`. The save / undo /
// reload plumbing had no automated coverage before this hook was split
// out; the construction cycle between the sync engine and the undo
// timeline (broken with the `resetHistory` ref) is the part most worth
// guarding. Driven through the public `useChecklist` composer against an
// in-memory adapter.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addItem, createChecklist } from "../../src/domain/checklists.ts";
import { emptySnapshot } from "../../src/domain/types.ts";
import { useChecklist } from "../../src/app/use-checklist.ts";
import {
  ConflictError,
  RateLimitError,
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

  it("serializes saves: edits during an in-flight save queue and drain without self-conflict", async () => {
    // A revision-checking cloud adapter whose `save()` is held open until the
    // test releases it, so edits can pile up while one write is in flight.
    // It rejects any save whose `baseRevision` doesn't match the current
    // server revision — exactly the check that makes a device collide with
    // its own just-completed write when two saves run concurrently.
    let serverText = serialize(emptySnapshot());
    let serverRev = 1;
    let conflicts = 0;
    const release: Array<() => void> = [];
    const adapter: StorageAdapter & {
      flushOne: () => void;
      inFlight: () => number;
      conflicts: () => number;
      stored: () => string;
    } = {
      id: "gdrive",
      label: "mem-cloud",
      capabilities: new Set(),
      load: async (): Promise<StoredSnapshot | null> => ({
        text: serverText,
        revision: String(serverRev),
      }),
      save: (next: string, baseRevision?: string) =>
        new Promise<StoredSnapshot>((resolve, reject) => {
          release.push(() => {
            if (baseRevision !== String(serverRev)) {
              conflicts += 1;
              reject(
                new ConflictError({
                  text: serverText,
                  revision: String(serverRev),
                }),
              );
              return;
            }
            serverText = next;
            serverRev += 1;
            resolve({ text: serverText, revision: String(serverRev) });
          });
        }),
      saveDebounceMs: 0,
      flushOne: () => release.shift()?.(),
      inFlight: () => release.length,
      conflicts: () => conflicts,
      stored: () => serverText,
    };

    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {}); // settle mount load — client bases on rev "1"

    // First edit kicks off a save that stays in flight (unreleased).
    act(() => result.current.addItem("a"));
    expect(adapter.inFlight()).toBe(1);

    // Two more edits arrive mid-flight. They must NOT start their own saves —
    // they queue, and the later one supersedes the earlier.
    act(() => result.current.addItem("b"));
    act(() => result.current.addItem("c"));
    expect(adapter.inFlight()).toBe(1);

    // Release the first save. Its completion drains the queue in exactly one
    // follow-up save (not two), based on the revision it just learned.
    await act(async () => adapter.flushOne());
    expect(adapter.inFlight()).toBe(1);

    // Release the drain save. No self-conflict ever surfaced.
    await act(async () => adapter.flushOne());
    expect(adapter.inFlight()).toBe(0);
    expect(adapter.conflicts()).toBe(0);
    expect(result.current.conflict).toBeNull();
    expect(result.current.status).toBe("saved");
    expect(result.current.dirty).toBe(false);

    // The drained write carried the full final snapshot — all three edits.
    expect(
      parse(adapter.stored()).checklists[0]!.items.map((i) => i.title),
    ).toEqual(["a", "b", "c"]);
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

describe("useChecklist offline / reconnect", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flags offline when a load is served from the on-device cache", async () => {
    // `withLocalCache` returns the cached snapshot marked `offline: true`
    // when the backend is unreachable; the engine must surface that.
    const adapter: StorageAdapter = {
      id: "dropbox",
      label: "mem-cloud",
      capabilities: new Set(),
      load: async (): Promise<StoredSnapshot | null> => ({
        text: serialize(emptySnapshot()),
        revision: "cached",
        offline: true,
      }),
      save: async (next: string) => ({ text: next, revision: "r" }),
      saveDebounceMs: 0,
    };
    const { result } = renderHook(() => useChecklist(adapter));
    await waitFor(() => expect(result.current.offline).toBe(true));
  });

  it("goes offline on a network save failure, then re-syncs when the connection returns", async () => {
    vi.useFakeTimers();
    // A cloud adapter that throws a raw network error (TypeError, the way
    // `fetch` rejects offline) until the test flips `healthy`. The engine
    // should mark itself offline, keep the edit queued, and — when the
    // browser fires `online` — flush the queue to a clean save.
    let serverText = serialize(emptySnapshot());
    let serverRev = 1;
    let healthy = false;
    const adapter: StorageAdapter = {
      id: "gdrive",
      label: "mem-cloud",
      capabilities: new Set(),
      load: async (): Promise<StoredSnapshot | null> => ({
        text: serverText,
        revision: String(serverRev),
      }),
      save: async (next: string) => {
        if (!healthy) throw new TypeError("Failed to fetch");
        serverText = next;
        serverRev += 1;
        return { text: serverText, revision: String(serverRev) };
      },
      saveDebounceMs: 0,
    };

    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => result.current.addItem("a"));
    // Drain the full backoff curve — the save ends up hard-errored, and the
    // network-level failure flipped us offline.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.offline).toBe(true);
    expect(result.current.dirty).toBe(true);

    // The connection returns. The `online` event flushes the queued edit; it
    // lands cleanly and the offline flag clears.
    healthy = true;
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.offline).toBe(false);
    expect(result.current.dirty).toBe(false);
    expect(parse(serverText).checklists[0]!.items.map((i) => i.title)).toEqual([
      "a",
    ]);
  });
});

describe("useChecklist throttle / transient-retry recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers from a rate limit by waiting out the cooldown and resuming", async () => {
    vi.useFakeTimers();
    // A cloud adapter that rate-limits the first save (with a short
    // cooldown) then accepts the retry. Mirrors Dropbox returning 429 +
    // Retry-After: the save must not surface a hard error — it goes
    // `throttled`, waits, and resumes to `saved` on its own.
    let serverText = serialize(emptySnapshot());
    let serverRev = 1;
    let attempts = 0;
    const adapter: StorageAdapter = {
      id: "dropbox",
      label: "mem-cloud",
      capabilities: new Set(),
      load: async (): Promise<StoredSnapshot | null> => ({
        text: serverText,
        revision: String(serverRev),
      }),
      save: async (next: string) => {
        attempts += 1;
        if (attempts === 1) throw new RateLimitError(50);
        serverText = next;
        serverRev += 1;
        return { text: serverText, revision: String(serverRev) };
      },
      saveDebounceMs: 0,
    };

    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => result.current.addItem("a"));
    // First save was rejected with a rate limit — the glyph goes orange,
    // not red, and the edit stays dirty pending the resume. Advance by 0 to
    // flush the rejection's microtasks without firing the cooldown timer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("throttled");
    expect(result.current.dirty).toBe(true);

    // Advance past the cooldown floor (≥250ms backoff floor for the first
    // 429). The resume timer fires, drains the queued edit, and the save
    // lands cleanly.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(attempts).toBe(2);
    expect(result.current.status).toBe("saved");
    expect(result.current.dirty).toBe(false);
    expect(parse(serverText).checklists[0]!.items.map((i) => i.title)).toEqual([
      "a",
    ]);
  });

  it("retries a transient backend hiccup before giving up, then surfaces error", async () => {
    vi.useFakeTimers();
    // A cloud adapter that throws a bare network error on every save — not
    // one of the three typed signals, so the save path retries it with
    // backoff up to the budget, keeping the glyph spinning, then surfaces
    // a hard error.
    let attempts = 0;
    const adapter: StorageAdapter = {
      id: "gdrive",
      label: "mem-cloud",
      capabilities: new Set(),
      load: async (): Promise<StoredSnapshot | null> => null,
      save: async () => {
        attempts += 1;
        throw new Error("Failed to fetch");
      },
      saveDebounceMs: 0,
    };

    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => result.current.addItem("a"));
    // Drain the full backoff curve (each step ≤ a couple seconds early on).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // 1 initial attempt + MAX_TRANSIENT_SAVE_RETRIES retries.
    expect(attempts).toBe(5);
    expect(result.current.status).toBe("error");
    expect(result.current.statusDetail).toBe("Failed to fetch");
  });

  it("retries a hard-errored save when the user invokes saveNow", async () => {
    vi.useFakeTimers();
    // A cloud adapter that hard-fails every save until the test flips
    // `healthy` true, then accepts. After the backoff budget is spent the
    // save surfaces a red error; the "Try again" affordance (saveNow) must
    // re-push the still-unsaved snapshot rather than silently no-op because
    // the failed write left nothing queued.
    let serverText = serialize(emptySnapshot());
    let serverRev = 1;
    let healthy = false;
    const adapter: StorageAdapter = {
      id: "gdrive",
      label: "mem-cloud",
      capabilities: new Set(),
      load: async (): Promise<StoredSnapshot | null> => ({
        text: serverText,
        revision: String(serverRev),
      }),
      save: async (next: string) => {
        if (!healthy) throw new Error("Failed to fetch");
        serverText = next;
        serverRev += 1;
        return { text: serverText, revision: String(serverRev) };
      },
      saveDebounceMs: 0,
    };

    const { result } = renderHook(() => useChecklist(adapter));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    act(() => result.current.addItem("a"));
    // Drain the full backoff curve — the save ends up hard-errored.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.dirty).toBe(true);

    // The backend recovers. Clicking "Try again" must actually re-push the
    // queued snapshot and land it — not just fire and no-op.
    healthy = true;
    await act(async () => {
      result.current.saveNow();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("saved");
    expect(result.current.dirty).toBe(false);
    expect(parse(serverText).checklists[0]!.items.map((i) => i.title)).toEqual([
      "a",
    ]);
  });
});
