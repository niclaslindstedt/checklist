import { describe, expect, it } from "vitest";

import type { Snapshot } from "../../src/domain/types.ts";
import { BLOB_FILE_NAME } from "../../src/storage/directory-adapter.ts";
import {
  createFolderAdapter,
  createFolderSettingsStore,
} from "../../src/storage/folder/index.ts";
import { encryptText } from "../../src/storage/crypto.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

// Minimal in-memory File System Access API directory handle, covering the
// slice the folder file store uses.
let clock = 0;

class MockFile {
  readonly kind = "file" as const;
  contents = "";
  lastModified = ++clock;
  constructor(readonly name: string) {}
  async getFile() {
    return {
      lastModified: this.lastModified,
      text: async () => this.contents,
    };
  }
  async createWritable() {
    let buffer = "";
    return {
      write: async (data: string) => {
        buffer = data;
      },
      close: async () => {
        this.contents = buffer;
        this.lastModified = ++clock;
      },
    };
  }
}

class MockDir {
  readonly kind = "directory" as const;
  children = new Map<string, MockFile | MockDir>();
  constructor(readonly name: string) {}

  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let child = this.children.get(name);
    if (!child) {
      if (!opts?.create) throw new DOMException("missing", "NotFoundError");
      child = new MockDir(name);
      this.children.set(name, child);
    }
    return child as MockDir;
  }

  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let child = this.children.get(name);
    if (!child) {
      if (!opts?.create) throw new DOMException("missing", "NotFoundError");
      child = new MockFile(name);
      this.children.set(name, child);
    }
    return child as MockFile;
  }

  async removeEntry(name: string) {
    if (!this.children.delete(name)) {
      throw new DOMException("missing", "NotFoundError");
    }
  }

  async *values() {
    yield* this.children.values();
  }
}

function handle(): MockDir {
  return new MockDir("root");
}

const snapshot: Snapshot = {
  templates: [
    {
      version: 1,
      id: "tpl1",
      name: "Trip",
      items: [{ id: "a", title: "Passport", required: true }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  checklists: [
    {
      version: 1,
      id: "cl1",
      templateId: "tpl1",
      name: "Groceries",
      items: [{ id: "1", title: "Milk", checked: false }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

function fileNames(dir: MockDir, prefix = ""): string[] {
  const out: string[] = [];
  for (const child of dir.children.values()) {
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    if (child instanceof MockDir) out.push(...fileNames(child, path));
    else out.push(path);
  }
  return out.sort();
}

describe("folder adapter", () => {
  it("writes markdown files under the namespace subfolder", async () => {
    const root = handle();
    const adapter = createFolderAdapter({
      directoryHandle: root as unknown as FileSystemDirectoryHandle,
    });
    await adapter.save(serialize(snapshot));
    expect(fileNames(root)).toEqual([
      "default/checklists/groceries-cl1.md",
      "default/templates/trip-tpl1.md",
    ]);
  });

  it("round-trips a snapshot through the folder", async () => {
    const root = handle();
    const adapter = createFolderAdapter({
      directoryHandle: root as unknown as FileSystemDirectoryHandle,
      namespace: "work",
    });
    await adapter.save(serialize(snapshot));
    const back = parse((await adapter.load())!.text);
    expect(back.checklists[0]!.name).toBe("Groceries");
    expect(back.templates[0]!.items[0]!.required).toBe(true);
  });

  it("returns null for an empty folder", async () => {
    const root = handle();
    const adapter = createFolderAdapter({
      directoryHandle: root as unknown as FileSystemDirectoryHandle,
    });
    expect(await adapter.load()).toBeNull();
  });

  it("isolates namespaces in separate subfolders", async () => {
    const root = handle();
    const home = createFolderAdapter({
      directoryHandle: root as unknown as FileSystemDirectoryHandle,
      namespace: "home",
    });
    const work = createFolderAdapter({
      directoryHandle: root as unknown as FileSystemDirectoryHandle,
      namespace: "work",
    });
    await home.save(serialize(snapshot));
    expect(await work.load()).toBeNull();
  });

  it("stores an encrypted envelope as a single blob file", async () => {
    const root = handle();
    const adapter = createFolderAdapter({
      directoryHandle: root as unknown as FileSystemDirectoryHandle,
    });
    const envelope = await encryptText(serialize(snapshot), "pw");
    await adapter.save(envelope);
    expect(fileNames(root)).toEqual([`default/${BLOB_FILE_NAME}`]);
    expect((await adapter.load())!.text).toBe(envelope);
  });

  it("stores settings.json at the picked-directory root, beside namespaces", async () => {
    const root = handle();
    const adapter = createFolderAdapter({
      directoryHandle: root as unknown as FileSystemDirectoryHandle,
    });
    const settings = createFolderSettingsStore(
      root as unknown as FileSystemDirectoryHandle,
    );
    await adapter.save(serialize(snapshot));
    expect(await settings.load()).toBeNull();
    await settings.save('{"theme":"dark"}');
    expect(fileNames(root)).toEqual([
      "default/checklists/groceries-cl1.md",
      "default/templates/trip-tpl1.md",
      "settings.json",
    ]);
    expect(await settings.load()).toBe('{"theme":"dark"}');
  });
});
