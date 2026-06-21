import { describe, expect, it } from "vitest";

import type { Snapshot } from "../../src/domain/types.ts";
import { ConflictError } from "../../src/storage/adapter.ts";
import { encryptText, isEncryptedEnvelope } from "../../src/storage/crypto.ts";
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

// A MemoryFileStore whose next `list()` can be made to throw a raw network
// error, modelling a save attempted while the link is flaky: `save` rejects
// before writing a byte, yet (in reality) the underlying request can still
// commit server-side — the lost-response write that drives phantom conflicts.
class FlakyFileStore extends MemoryFileStore {
  private failListOnce = false;
  failNextList(): void {
    this.failListOnce = true;
  }
  override async list(): Promise<FileEntry[]> {
    if (this.failListOnce) {
      this.failListOnce = false;
      throw new TypeError("Load failed");
    }
    return super.list();
  }
}

// A MemoryFileStore that lists its files in reverse insertion order. The cloud
// backends don't guarantee `list()` returns files in the order they were
// written — and the in-memory document's order can come from the offline cache,
// not the backend — so a snapshot rebuilt from a listing can carry its
// checklists in a different array order than the document about to be written.
// Same content, same byte length, different order: the exact shape that broke
// phantom-conflict detection in the field.
class ReorderingFileStore extends MemoryFileStore {
  override async list(): Promise<FileEntry[]> {
    return (await super.list()).reverse();
  }
}

// Minimal in-memory `Storage` for the persisted write log — survives across
// adapter instances the way `localStorage` survives across a page reload.
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
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

// Two checklists, so the order the top-level array is serialized in actually
// matters when the backend lists files in a different order than the document.
const twoLists: Snapshot = {
  templates: [],
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
    {
      version: 1,
      id: "cl2",
      templateId: "",
      name: "Packing",
      items: [{ id: "1", title: "Socks", checked: false }],
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

  // A backend can drift into holding BOTH the plaintext markdown and a stale
  // `checklist.json` envelope. `load` surfaces the markdown (it wins over the
  // blob), so disabling encryption re-saves that markdown — which must drop the
  // orphaned envelope, otherwise the encrypted file lingers forever. This is
  // the contract the `disableEncryption` fix relies on: re-saving the surfaced
  // document (whatever it is) is enough to clear the superseded representation.
  it("clears a shadowed encrypted blob when the surfaced markdown is re-saved (disable from a both-representations state)", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(snapshot));
    // A stale envelope sits beside the markdown.
    await store.write(
      BLOB_FILE_NAME,
      JSON.stringify({ encrypted: "checklist.encrypted.v1" }),
    );

    const loaded = await adapter.load();
    // The markdown is what surfaces, not the envelope — which is exactly why
    // the disable path can't gate its re-save on "did the load return a blob".
    expect(isEncryptedEnvelope(loaded!.text)).toBe(false);
    await adapter.save(loaded!.text, loaded!.revision);

    const paths = store.paths();
    expect(paths).not.toContain(BLOB_FILE_NAME);
    expect(paths.every((p) => p.endsWith(".md"))).toBe(true);
  });

  // The symmetric case: writing the envelope clears every markdown file (so the
  // next load reads the ciphertext, not the plaintext markdown back), and
  // writing markdown clears the blob — even when a fresh adapter that never
  // tracked the old representation does the write.
  it("swaps representations cleanly when a fresh adapter writes the other format", async () => {
    const { store } = build();
    // One adapter lays down the plaintext notes…
    await createDirectoryAdapter(store, { id: "dev", label: "M" }).save(
      serialize(snapshot),
    );
    // …and a different, fresh adapter writes the envelope without loading.
    const envelope = JSON.stringify({ encrypted: "checklist.encrypted.v1" });
    await createDirectoryAdapter(store, { id: "dev", label: "M" }).save(
      envelope,
    );
    expect(store.paths()).toEqual([BLOB_FILE_NAME]);

    // Decrypting back: yet another fresh adapter writes markdown, blob clears.
    await createDirectoryAdapter(store, { id: "dev", label: "M" }).save(
      serialize(snapshot),
    );
    expect(store.paths()).not.toContain(BLOB_FILE_NAME);
    expect(store.paths().every((p) => p.endsWith(".md"))).toBe(true);
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

  // Phantom-conflict regression: on a flaky link a save can commit to the
  // backend while its response is lost, so the device never learns the new
  // revision and keeps basing on the stale one. The next save sees the
  // revision "move" even though the remote holds exactly what this device
  // wrote — that must NOT surface as a conflict over the user's own edit.
  it("adopts the moved revision instead of conflicting when a lost-response write already landed these bytes", async () => {
    const { adapter } = build();
    const text = serialize(snapshot);
    const first = await adapter.save(text);
    // The "lost response" write: it commits (the remote advances to a new
    // revision holding the same document) but the client never sees the result.
    const landed = await adapter.save(text, first.revision);
    expect(landed.revision).not.toBe(first.revision);
    // The client retries on its now-stale base. Because the remote already
    // equals these bytes, the save succeeds and adopts the moved revision
    // rather than throwing a ConflictError.
    const resolved = await adapter.save(text, first.revision);
    expect(resolved.revision).toBe(landed.revision);
  });

  // The deeper phantom-conflict case: a lost-response write lands, and the
  // user keeps editing before the device next reaches the backend, so the
  // local document has moved *ahead* of what's on the remote. The remote then
  // holds an earlier write of ours — not another device — so the newer bytes
  // must be written over it rather than surfacing a conflict.
  it("writes newer edits over a lost-response write instead of conflicting", async () => {
    const { adapter } = build();
    const first = await adapter.save(serialize(snapshot));
    // The user adds "Eggs" → docB. Its save lands server-side but the response
    // is lost, so the device keeps basing on `first.revision`.
    const withEggs = {
      ...snapshot,
      checklists: [
        {
          ...snapshot.checklists[0]!,
          items: [
            ...snapshot.checklists[0]!.items,
            { id: "2", title: "Eggs", checked: false },
          ],
        },
      ],
    };
    const landed = await adapter.save(serialize(withEggs), first.revision);
    expect(landed.revision).not.toBe(first.revision);
    // The user adds "Bread" → docC, still basing on the stale `first.revision`
    // (the device never learned `landed.revision`). The remote holds docB —
    // our own earlier write — so this writes docC through, no ConflictError.
    const withBread = {
      ...withEggs,
      checklists: [
        {
          ...withEggs.checklists[0]!,
          items: [
            ...withEggs.checklists[0]!.items,
            { id: "3", title: "Bread", checked: false },
          ],
        },
      ],
    };
    const resolved = await adapter.save(serialize(withBread), first.revision);
    expect(resolved.revision).not.toBe(landed.revision);
    const loaded = await adapter.load();
    expect(
      parse(loaded!.text).checklists[0]!.items.map((i) => i.title),
    ).toEqual(["Milk", "Eggs", "Bread"]);
  });

  // The failure the field logs exposed: the lost-response write happens during
  // an *offline* attempt, where `store.list()` throws before the adapter writes
  // a byte — so a history recorded only on the post-list path never captures
  // it. The document must still be remembered (recorded up front, before the
  // network round-trip) so the later online save recognises the remote as our
  // own earlier write instead of surfacing a phantom conflict.
  it("remembers a write attempted while offline so a later save doesn't conflict over it", async () => {
    const store = new FlakyFileStore();
    const adapter = createDirectoryAdapter(store, {
      id: "dev",
      label: "Memory",
    });
    const first = await adapter.save(serialize(snapshot));

    // The user adds "Eggs" → docB and saves, but the link is flaky: `list()`
    // throws, so this attempt rejects before the adapter writes anything.
    const withEggs = {
      ...snapshot,
      checklists: [
        {
          ...snapshot.checklists[0]!,
          items: [
            ...snapshot.checklists[0]!.items,
            { id: "2", title: "Eggs", checked: false },
          ],
        },
      ],
    };
    store.failNextList();
    await expect(
      adapter.save(serialize(withEggs), first.revision),
    ).rejects.toBeInstanceOf(TypeError);

    // …yet the underlying request committed server-side (the lost response).
    // Model that landing with a separate adapter laying down docB's bytes.
    await createDirectoryAdapter(store, { id: "dev", label: "M" }).save(
      serialize(withEggs),
    );

    // The user adds "Bread" → docC and saves online, still basing on the stale
    // `first.revision`. The remote holds docB — which this device *tried* to
    // write while offline — so it must write through, not conflict.
    const withBread = {
      ...withEggs,
      checklists: [
        {
          ...withEggs.checklists[0]!,
          items: [
            ...withEggs.checklists[0]!.items,
            { id: "3", title: "Bread", checked: false },
          ],
        },
      ],
    };
    const resolved = await adapter.save(serialize(withBread), first.revision);
    const loaded = await adapter.load();
    expect(resolved.revision).toBe(loaded!.revision);
    expect(
      parse(loaded!.text).checklists[0]!.items.map((i) => i.title),
    ).toEqual(["Milk", "Eggs", "Bread"]);
  });

  // The field failure: the remote held byte-for-byte the same *content* as an
  // earlier local write but, rebuilt from a listing in a different order than
  // the in-memory document, serialized its checklists in a different array
  // order — same length, different bytes — so the phantom check never matched
  // and surfaced a conflict over the user's own write. The comparison must be
  // order-independent.
  it("adopts a lost-response write of identical content even when the backend lists files in a different order", async () => {
    const store = new ReorderingFileStore();
    const adapter = createDirectoryAdapter(store, { id: "dev", label: "M" });
    const text = serialize(twoLists);
    const first = await adapter.save(text);
    // The lost-response write: identical content commits, the revision moves.
    const landed = await adapter.save(text, first.revision);
    expect(landed.revision).not.toBe(first.revision);
    // The retry bases on the stale revision. The remote holds the same content
    // (just listed in a different order) — adopt it, don't conflict.
    const resolved = await adapter.save(text, first.revision);
    expect(resolved.revision).toBe(landed.revision);
  });

  it("writes newer edits over an out-of-order lost-response write instead of conflicting", async () => {
    const store = new ReorderingFileStore();
    const adapter = createDirectoryAdapter(store, { id: "dev", label: "M" });
    const first = await adapter.save(serialize(twoLists));
    // The user adds an item → docB. This device tries to write it but the link
    // is flaky, so the attempt is recorded yet the device never learns the new
    // revision; meanwhile docB commits server-side (modelled by a second
    // adapter laying down its bytes).
    const withMore = {
      ...twoLists,
      checklists: [
        {
          ...twoLists.checklists[0]!,
          items: [
            ...twoLists.checklists[0]!.items,
            { id: "2", title: "Eggs", checked: false },
          ],
        },
        twoLists.checklists[1]!,
      ],
    };
    await adapter.save(serialize(withMore), first.revision);
    await createDirectoryAdapter(store, { id: "dev", label: "M" }).save(
      serialize(withMore),
    );
    // The user adds another item → docC, still basing on the stale `first`
    // revision. The remote holds docB — listed in a different order than the
    // in-memory document — but it's our own earlier write, so docC writes
    // through instead of surfacing a conflict.
    const evenMore = {
      ...withMore,
      checklists: [
        {
          ...withMore.checklists[0]!,
          items: [
            ...withMore.checklists[0]!.items,
            { id: "3", title: "Bread", checked: false },
          ],
        },
        withMore.checklists[1]!,
      ],
    };
    const resolved = await adapter.save(serialize(evenMore), first.revision);
    const loaded = await adapter.load();
    expect(resolved.revision).toBe(loaded!.revision);
  });

  // The cross-reload case from the field logs: a lost-response write commits in
  // one session, the app reloads (a fresh adapter with no in-memory history)
  // and loads a *stale* revision from the offline cache, then the user keeps
  // editing. The persisted write log lets the new session still recognise the
  // remote as its own earlier write instead of surfacing a phantom conflict.
  it("recognises a write from before a reload via the persisted write log", async () => {
    const storage = new MemoryStorage();
    const store = new MemoryFileStore();
    const writeLog = { storage, key: "checklist:writelog:dev:default" };

    // Session A: save a baseline, then write docB (recorded + persisted). docB
    // lands but — as in the field — the device never carries its revision into
    // the next session (the offline cache kept the *baseline* revision).
    const sessionA = createDirectoryAdapter(store, {
      id: "dev",
      label: "M",
      writeLog,
    });
    const first = await sessionA.save(serialize(twoLists));
    const withMore = {
      ...twoLists,
      checklists: [
        {
          ...twoLists.checklists[0]!,
          items: [
            ...twoLists.checklists[0]!.items,
            { id: "2", title: "Eggs", checked: false },
          ],
        },
        twoLists.checklists[1]!,
      ],
    };
    await sessionA.save(serialize(withMore), first.revision);

    // Session B: a brand-new adapter (the reload) over the same backend and the
    // same persisted log, with no in-memory history. The user keeps editing
    // from the stale baseline revision.
    const sessionB = createDirectoryAdapter(store, {
      id: "dev",
      label: "M",
      writeLog,
    });
    const evenMore = {
      ...withMore,
      checklists: [
        {
          ...withMore.checklists[0]!,
          items: [
            ...withMore.checklists[0]!.items,
            { id: "3", title: "Bread", checked: false },
          ],
        },
        withMore.checklists[1]!,
      ],
    };
    // The remote holds docB (session A's write). Without the persisted log this
    // is "unrecognised" and conflicts; with it, docC writes through.
    const resolved = await sessionB.save(serialize(evenMore), first.revision);
    const loaded = await sessionB.load();
    expect(resolved.revision).toBe(loaded!.revision);
  });

  // A genuinely different remote document — one this device never wrote, in any
  // session — is still a real conflict even with the persisted log in play.
  it("still conflicts on a genuinely foreign document despite the persisted log", async () => {
    const storage = new MemoryStorage();
    const store = new MemoryFileStore();
    const writeLog = { storage, key: "checklist:writelog:dev:default" };
    const ours = createDirectoryAdapter(store, {
      id: "dev",
      label: "M",
      writeLog,
    });
    const first = await ours.save(serialize(twoLists));
    // Another device (its own adapter, no shared log) writes a different doc.
    const theirs = {
      ...twoLists,
      checklists: [
        { ...twoLists.checklists[0]!, name: "Theirs" },
        twoLists.checklists[1]!,
      ],
    };
    await createDirectoryAdapter(store, { id: "dev", label: "M" }).save(
      serialize(theirs),
      first.revision,
    );
    // A fresh session of ours (persisted log loaded) must still conflict.
    const reopened = createDirectoryAdapter(store, {
      id: "dev",
      label: "M",
      writeLog,
    });
    await expect(
      reopened.save(serialize(twoLists), first.revision),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  // The guard must not over-reach: a genuinely different remote document from
  // another device (a separate adapter over the same backend, with its own
  // write history) still conflicts.
  it("still raises a ConflictError when the remote holds a genuinely different document", async () => {
    const { store, adapter } = build();
    const first = await adapter.save(serialize(snapshot));
    // A second device — a distinct adapter sharing the backend — renames the
    // list and saves on top of our base revision.
    const otherDevice = createDirectoryAdapter(store, {
      id: "dev",
      label: "Memory",
    });
    const theirs = {
      ...snapshot,
      checklists: [{ ...snapshot.checklists[0]!, name: "Their list" }],
    };
    await otherDevice.save(serialize(theirs), first.revision);
    // We try to save our (different) document on the stale base — a real clash.
    await expect(
      adapter.save(serialize(snapshot), first.revision),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

const foldered: Snapshot = {
  templates: [],
  checklists: [
    {
      version: 1,
      id: "cl1",
      templateId: "",
      name: "Groceries",
      items: [],
      folderId: "f-work",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      version: 1,
      id: "cl2",
      templateId: "",
      name: "Loose",
      items: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  folders: [{ id: "f-work", name: "Work", createdAt: "2026-01-01T00:00:00Z" }],
};

describe("directory adapter — folders", () => {
  it("files a grouped checklist inside its physical folder directory", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(foldered));
    const paths = store.paths();
    expect(paths).toContain("checklists/work/groceries-cl1.md");
    expect(paths).toContain("checklists/loose-cl2.md");
    expect(paths).toContain("folders.json");
  });

  it("writes the folder registry sidecar with names + empty folders", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(foldered));
    const json = await store.read("folders.json");
    expect(JSON.parse(json!)).toEqual([
      { id: "f-work", name: "Work", createdAt: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("round-trips folder names and per-list links through a reload", async () => {
    const { adapter } = build();
    await adapter.save(serialize(foldered));
    const loaded = await adapter.load();
    const snap = parse(loaded!.text);
    expect(snap.folders).toEqual(foldered.folders);
    expect(snap.checklists.find((c) => c.id === "cl1")?.folderId).toBe(
      "f-work",
    );
    expect(
      snap.checklists.find((c) => c.id === "cl2")?.folderId,
    ).toBeUndefined();
  });

  it("persists an empty folder (one no checklist references) via the sidecar", async () => {
    const { store, adapter } = build();
    const emptyFolderOnly: Snapshot = {
      templates: [],
      checklists: [],
      folders: [
        { id: "f-x", name: "Someday", createdAt: "2026-01-01T00:00:00Z" },
      ],
    };
    await adapter.save(serialize(emptyFolderOnly));
    expect(store.paths()).toContain("folders.json");
    const loaded = await adapter.load();
    expect(loaded).not.toBeNull();
    expect(parse(loaded!.text).folders).toEqual(emptyFolderOnly.folders);
  });

  it("moves a list out of its folder, removing the now-stale file path", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(foldered));
    expect(store.paths()).toContain("checklists/work/groceries-cl1.md");
    const moved: Snapshot = {
      ...foldered,
      checklists: foldered.checklists.map((c) =>
        c.id === "cl1" ? { ...c, folderId: undefined } : c,
      ),
    };
    await adapter.save(serialize(moved));
    expect(store.paths()).not.toContain("checklists/work/groceries-cl1.md");
    expect(store.paths()).toContain("checklists/groceries-cl1.md");
  });

  it("skips a redundant sidecar rewrite when the registry is unchanged", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(foldered));
    const rev1 = (await store.list()).find(
      (e) => e.path === "folders.json",
    )!.rev;
    // Re-save the same folders (only a checklist body changed) — sidecar stays.
    await adapter.save(serialize(foldered));
    const rev2 = (await store.list()).find(
      (e) => e.path === "folders.json",
    )!.rev;
    expect(rev2).toBe(rev1);
  });

  it("clears the plaintext sidecar when encryption takes over", async () => {
    const { store, adapter } = build();
    await adapter.save(serialize(foldered));
    expect(store.paths()).toContain("folders.json");
    const envelope = await encryptText(serialize(foldered), "pw");
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    await adapter.save(envelope);
    expect(store.paths()).toEqual([BLOB_FILE_NAME]);
  });
});
