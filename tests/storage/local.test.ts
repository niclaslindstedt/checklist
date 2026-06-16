import { beforeEach, describe, expect, it } from "vitest";
import {
  BrowserLocalStorageAdapter,
  deleteLocalNamespace,
} from "../../src/storage/local/index.ts";

// An in-memory Storage stub injected into the adapter. Tests never touch
// the real `localStorage` (see AGENTS.md test conventions).
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

describe("BrowserLocalStorageAdapter", () => {
  let adapter: BrowserLocalStorageAdapter;

  beforeEach(() => {
    adapter = new BrowserLocalStorageAdapter(new MemoryStorage());
  });

  it("returns null before anything is stored", async () => {
    expect(adapter.loadSync()).toBeNull();
    expect(await adapter.load()).toBeNull();
  });

  it("round-trips saved text through both load paths", async () => {
    const text = '{"templates":[],"checklists":[]}\n';
    const stored = await adapter.save(text);
    expect(stored.text).toBe(text);
    expect(adapter.loadSync()?.text).toBe(text);
    expect((await adapter.load())?.text).toBe(text);
  });

  it("identifies itself and advertises the loadSync capability", () => {
    expect(adapter.id).toBe("browser");
    expect(adapter.capabilities.has("loadSync")).toBe(true);
  });

  it("keeps the legacy key for default but a separate key per namespace", async () => {
    const storage = new MemoryStorage();
    const def = new BrowserLocalStorageAdapter(storage, "default");
    const family = new BrowserLocalStorageAdapter(storage, "family");
    await def.save("default-doc\n");
    await family.save("family-doc\n");

    expect(storage.getItem("checklist:v1")).toBe("default-doc\n");
    expect(storage.getItem("checklist:v1:family")).toBe("family-doc\n");
    // The two namespaces never read each other's bytes.
    expect((await def.load())?.text).toBe("default-doc\n");
    expect((await family.load())?.text).toBe("family-doc\n");
  });

  it("deletes only the targeted namespace's bytes", async () => {
    const storage = new MemoryStorage();
    await new BrowserLocalStorageAdapter(storage, "default").save("keep\n");
    await new BrowserLocalStorageAdapter(storage, "family").save("drop\n");

    deleteLocalNamespace("family", storage);

    expect(storage.getItem("checklist:v1:family")).toBeNull();
    expect(storage.getItem("checklist:v1")).toBe("keep\n");
  });
});
