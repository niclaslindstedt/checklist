import { describe, expect, it } from "vitest";

import type { FileEntry, FileStore } from "../../src/storage/file-store.ts";
import {
  SETTINGS_FILE_NAME,
  fileSettingsStore,
} from "../../src/storage/settings-store.ts";

// Minimal in-memory FileStore that records the paths it's asked for, so we
// can assert the settings store reads/writes exactly `settings.json`.
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

describe("fileSettingsStore", () => {
  it("reads null when no settings file exists", async () => {
    const store = fileSettingsStore(new MemFileStore());
    expect(await store.load()).toBeNull();
  });

  it("round-trips the settings JSON through settings.json", async () => {
    const fs = new MemFileStore();
    const store = fileSettingsStore(fs);
    await store.save('{"theme":"dark"}');
    expect(fs.writes).toEqual([SETTINGS_FILE_NAME]);
    expect(await store.load()).toBe('{"theme":"dark"}');
    expect(fs.reads).toContain(SETTINGS_FILE_NAME);
  });

  it("targets the file at the store root, not inside a namespace", async () => {
    const fs = new MemFileStore();
    const store = fileSettingsStore(fs);
    await store.save("{}");
    expect([...fs.files.keys()]).toEqual(["settings.json"]);
  });
});
