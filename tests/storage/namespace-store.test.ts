import { describe, expect, it } from "vitest";

import type { FileEntry, FileStore } from "../../src/storage/file-store.ts";
import {
  NAMESPACES_FILE_NAME,
  fileNamespaceStore,
} from "../../src/storage/namespace-store.ts";

// Minimal in-memory FileStore that records the paths it's asked for, so we
// can assert the namespace store reads/writes exactly `namespaces.json`.
class MemFileStore implements FileStore {
  files = new Map<string, string>();
  reads: string[] = [];
  writes: string[] = [];
  async list(): Promise<FileEntry[]> {
    return [...this.files.keys()].map((path) => ({ path }));
  }
  async read(path: string): Promise<string | null> {
    this.reads.push(path);
    return this.files.get(path) ?? null;
  }
  async write(path: string, text: string): Promise<void> {
    this.writes.push(path);
    this.files.set(path, text);
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}

describe("fileNamespaceStore", () => {
  it("reads null when no registry file exists", async () => {
    const store = fileNamespaceStore(new MemFileStore());
    expect(await store.load()).toBeNull();
  });

  it("round-trips the registry JSON through namespaces.json", async () => {
    const fs = new MemFileStore();
    const store = fileNamespaceStore(fs);
    await store.save('[{"slug":"default","name":"Default"}]');
    expect(fs.writes).toEqual([NAMESPACES_FILE_NAME]);
    expect(await store.load()).toBe('[{"slug":"default","name":"Default"}]');
    expect(fs.reads).toContain(NAMESPACES_FILE_NAME);
  });

  it("targets the file at the store root, not inside a namespace", async () => {
    const fs = new MemFileStore();
    const store = fileNamespaceStore(fs);
    await store.save("[]");
    expect([...fs.files.keys()]).toEqual(["namespaces.json"]);
  });
});
