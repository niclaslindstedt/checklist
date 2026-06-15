import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageBackend } from "../../src/storage/local/index.ts";
import { createTemplate } from "../../src/domain/templates.ts";
import { instantiate } from "../../src/domain/checklists.ts";

// An in-memory Storage stub injected into the backend. Tests never touch the
// real `localStorage` (see AGENTS.md test conventions).
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const NOW = "2026-01-01T00:00:00.000Z";

describe("LocalStorageBackend", () => {
  let backend: LocalStorageBackend;

  beforeEach(() => {
    backend = new LocalStorageBackend(new MemoryStorage());
  });

  it("starts empty", async () => {
    expect(await backend.loadAll()).toEqual({ templates: [], checklists: [] });
  });

  it("persists, upserts, and deletes", async () => {
    const t = createTemplate({ id: "t1", name: "Trip", now: NOW });
    await backend.saveTemplate(t);
    await backend.saveTemplate({ ...t, name: "Trip 2" });
    const snap = await backend.loadAll();
    expect(snap.templates).toHaveLength(1);
    expect(snap.templates[0]?.name).toBe("Trip 2");

    await backend.saveChecklist(instantiate(t, "c1", NOW));
    expect((await backend.loadAll()).checklists).toHaveLength(1);

    await backend.delete("c1");
    expect((await backend.loadAll()).checklists).toHaveLength(0);
  });

  it("notifies subscribers on write and stops after unsubscribe", async () => {
    let calls = 0;
    const unsub = backend.subscribe(() => calls++);
    await backend.saveTemplate(
      createTemplate({ id: "t1", name: "A", now: NOW }),
    );
    expect(calls).toBe(1);
    unsub();
    await backend.saveTemplate(
      createTemplate({ id: "t2", name: "B", now: NOW }),
    );
    expect(calls).toBe(1);
  });
});
