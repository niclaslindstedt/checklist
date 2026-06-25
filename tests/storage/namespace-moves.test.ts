// Direct coverage for the cross-namespace move primitive lifted out of
// `useStorageBackend`. Drives `writeMovedDocument` against a mock adapter so
// the load → transform → save shape — and the save-failure path the hook
// tests (browser backend, never throws) can't reach — is exercised in
// isolation.
import { describe, expect, it, vi } from "vitest";

import { createChecklist } from "../../src/domain/checklists.ts";
import { emptySnapshot, type Snapshot } from "../../src/domain/types.ts";
import type { StorageAdapter, StoredSnapshot } from "../../src/storage/adapter.ts";
import { writeMovedDocument } from "../../src/storage/namespace-moves.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

/** A minimal in-memory adapter whose load / save can be stubbed per test. */
function mockAdapter(
  overrides: Partial<Pick<StorageAdapter, "load" | "save">> = {},
): StorageAdapter {
  return {
    id: "browser",
    label: "Mock",
    capabilities: new Set(),
    load: vi.fn(async () => null),
    save: vi.fn(async (text: string) => ({ text }) as StoredSnapshot),
    ...overrides,
  };
}

describe("writeMovedDocument", () => {
  it("saves the transformed document and returns ok", async () => {
    const saved: string[] = [];
    const adapter = mockAdapter({
      load: async () => null,
      save: async (text) => {
        saved.push(text);
        return { text } as StoredSnapshot;
      },
    });

    const list = createChecklist("c1", "Recipes", "2026-01-01T00:00:00.000Z");
    const result = await writeMovedDocument(adapter, (doc) => ({
      ...doc,
      checklists: [list, ...doc.checklists],
    }));

    expect(result).toEqual({ ok: true });
    expect(saved).toHaveLength(1);
    expect(parse(saved[0]).checklists.map((c) => c.id)).toEqual(["c1"]);
  });

  it("treats a load failure as an empty document", async () => {
    let seen: Snapshot | null = null;
    const adapter = mockAdapter({
      load: async () => {
        throw new Error("offline");
      },
      save: async (text) => ({ text }) as StoredSnapshot,
    });

    const result = await writeMovedDocument(adapter, (doc) => {
      seen = doc;
      return doc;
    });

    expect(result).toEqual({ ok: true });
    expect(seen).toEqual(emptySnapshot());
  });

  it("passes the loaded revision back to save for optimistic concurrency", async () => {
    const save = vi.fn(async (text: string) => ({ text }) as StoredSnapshot);
    const adapter = mockAdapter({
      load: async () => ({ text: serialize(emptySnapshot()), revision: "r-7" }),
      save,
    });

    await writeMovedDocument(adapter, (doc) => doc);

    expect(save).toHaveBeenCalledWith(expect.any(String), "r-7");
  });

  it("returns the thrown error when the save fails", async () => {
    const boom = new Error("conflict");
    const adapter = mockAdapter({
      load: async () => null,
      save: async () => {
        throw boom;
      },
    });

    const result = await writeMovedDocument(adapter, (doc) => doc);

    expect(result).toEqual({ ok: false, error: boom });
  });
});
