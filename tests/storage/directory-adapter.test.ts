import { describe, expect, it } from "vitest";

import type { Snapshot } from "../../src/domain/types.ts";
import { ConflictError } from "../../src/storage/adapter.ts";
import { encryptText } from "../../src/storage/crypto.ts";
import {
  BLOB_FILE_NAME,
  createDirectoryAdapter,
} from "../../src/storage/directory-adapter.ts";
import type { FileEntry, FileStore } from "../../src/storage/file-store.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

// In-memory FileStore whose revisions are a per-file write counter, so
// any change to a file's bytes changes the directory's aggregate.
class MemoryFileStore implements FileStore {
  private files = new Map<string, { text: string; rev: number }>();
  private counter = 0;

  async list(): Promise<FileEntry[]> {
    return [...this.files.entries()].map(([path, f]) => ({
      path,
      rev: String(f.rev),
    }));
  }
  async read(path: string): Promise<string | null> {
    return this.files.get(path)?.text ?? null;
  }
  async write(path: string, text: string): Promise<void> {
    this.files.set(path, { text, rev: ++this.counter });
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
  paths(): string[] {
    return [...this.files.keys()].sort();
  }
}

const snapshot: Snapshot = {
  templates: [
    {
      version: 1,
      id: "tpl1",
      name: "Trip",
      items: [{ id: "a", title: "Passport" }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  checklists: [
    {
      version: 1,
      id: "cl1",
      templateId: "",
      name: "Groceries",
      items: [{ id: "1", title: "Milk", checked: false }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

function build() {
  const store = new MemoryFileStore();
  const adapter = createDirectoryAdapter(store, {
    id: "dev",
    label: "Memory",
  });
  return { store, adapter };
}

describe("directory adapter", () => {
  it("returns null before anything is written", async () => {
    const { adapter } = build();
    expect(await adapter.load()).toBeNull();
  });

  it("writes one markdown file per checklist and template", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(snapshot));
    expect(store.paths()).toEqual([
      "checklists/groceries-cl1.md",
      "templates/trip-tpl1.md",
    ]);
  });

  it("round-trips a snapshot through markdown files", async () => {
    const { adapter } = build();
    await adapter.save(serialize(snapshot));
    const loaded = await adapter.load();
    const back = parse(loaded!.text);
    expect(back.checklists[0]!.name).toBe("Groceries");
    expect(back.templates[0]!.name).toBe("Trip");
  });

  it("deletes the markdown file for a removed checklist", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(snapshot));
    await adapter.save(serialize({ ...snapshot, checklists: [] }));
    expect(store.paths()).toEqual(["templates/trip-tpl1.md"]);
  });

  it("rewrites the file when a checklist is renamed", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(snapshot));
    const renamed = {
      ...snapshot,
      checklists: [{ ...snapshot.checklists[0]!, name: "Shopping" }],
    };
    await adapter.save(serialize(renamed));
    expect(store.paths()).toEqual([
      "checklists/shopping-cl1.md",
      "templates/trip-tpl1.md",
    ]);
  });

  it("stores an encrypted envelope as a single blob file", async () => {
    const { store, adapter } = build();
    const envelope = await encryptText(serialize(snapshot), "pw");
    await adapter.save(envelope);
    expect(store.paths()).toEqual([BLOB_FILE_NAME]);
    const loaded = await adapter.load();
    expect(loaded!.text).toBe(envelope);
  });

  it("migrates a legacy JSON blob to markdown on next save", async () => {
    const { store, adapter } = build();
    // Seed a legacy plaintext document at the blob path.
    await store.write(BLOB_FILE_NAME, serialize(snapshot));
    const loaded = await adapter.load();
    expect(parse(loaded!.text).checklists[0]!.name).toBe("Groceries");
    // Saving plaintext migrates to markdown and clears the blob.
    await adapter.save(loaded!.text);
    expect(store.paths()).toEqual([
      "checklists/groceries-cl1.md",
      "templates/trip-tpl1.md",
    ]);
  });

  it("raises a ConflictError when the directory moved past baseRevision", async () => {
    const { store, adapter } = build();
    const first = await adapter.save(serialize(snapshot));
    // Another writer changes a file out of band.
    await store.write("checklists/groceries-cl1.md", "tampered");
    await expect(
      adapter.save(serialize(snapshot), first.revision),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
