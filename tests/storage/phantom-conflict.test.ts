import { describe, expect, it } from "vitest";

import type { Snapshot } from "../../src/domain/types.ts";
import {
  comparable,
  fingerprint,
  resolvePhantomConflict,
} from "../../src/storage/phantom-conflict.ts";
import { serialize } from "../../src/storage/serialize.ts";

const base: Snapshot = {
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

// Same content as `base`, but the top-level checklist array is reversed — the
// shape a backend that lists files in a different order than the in-memory
// document produces. The two serialize to the same length but different bytes.
const reordered: Snapshot = {
  templates: base.templates,
  checklists: [base.checklists[1]!, base.checklists[0]!],
};

describe("fingerprint", () => {
  it("is stable for identical input", () => {
    expect(fingerprint("hello")).toBe(fingerprint("hello"));
  });

  it("distinguishes different documents", () => {
    expect(fingerprint("hello")).not.toBe(fingerprint("hellp"));
  });

  it("encodes the length so a same-length collision still differs by hash", () => {
    const a = fingerprint("ab");
    const b = fingerprint("cd");
    expect(a.startsWith("2:")).toBe(true);
    expect(b.startsWith("2:")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("is the empty-string sentinel for an empty document", () => {
    expect(fingerprint("")).toMatch(/^0:/);
  });
});

describe("comparable", () => {
  it("is order-independent across the top-level checklist array", () => {
    expect(comparable(serialize(base))).toBe(comparable(serialize(reordered)));
  });

  it("still differs when the actual content differs", () => {
    const renamed: Snapshot = {
      ...base,
      checklists: [
        { ...base.checklists[0]!, name: "Shopping" },
        base.checklists[1]!,
      ],
    };
    expect(comparable(serialize(base))).not.toBe(
      comparable(serialize(renamed)),
    );
  });

  it("sorts the folder array by id so a reordered sidecar still compares equal", () => {
    const withFolders: Snapshot = {
      ...base,
      folders: [
        { id: "f-a", name: "Work", createdAt: "2026-01-01T00:00:00Z" },
        { id: "f-b", name: "Home", createdAt: "2026-01-01T00:00:00Z" },
      ],
    };
    const reorderedFolders: Snapshot = {
      ...base,
      folders: [withFolders.folders![1]!, withFolders.folders![0]!],
    };
    expect(comparable(serialize(withFolders))).toBe(
      comparable(serialize(reorderedFolders)),
    );
  });

  it("preserves item order within a list (intrinsic to the document)", () => {
    const swappedItems: Snapshot = {
      ...base,
      checklists: [
        {
          ...base.checklists[0]!,
          items: [
            { id: "2", title: "Eggs", checked: false },
            { id: "1", title: "Milk", checked: false },
          ],
        },
        base.checklists[1]!,
      ],
    };
    const original: Snapshot = {
      ...base,
      checklists: [
        {
          ...base.checklists[0]!,
          items: [
            { id: "1", title: "Milk", checked: false },
            { id: "2", title: "Eggs", checked: false },
          ],
        },
        base.checklists[1]!,
      ],
    };
    expect(comparable(serialize(swappedItems))).not.toBe(
      comparable(serialize(original)),
    );
  });
});

describe("resolvePhantomConflict", () => {
  const remoteDoc = serialize(base);
  const writingFingerprint = fingerprint(comparable(remoteDoc));

  it("adopts when the remote already holds exactly the bytes we're writing", () => {
    expect(
      resolvePhantomConflict({
        writingFingerprint,
        remoteDoc,
        recentWrites: [],
      }),
    ).toBe("adopt");
  });

  it("adopts even when the remote lists its files in a different order", () => {
    // The remote is the same content, reordered — a raw byte compare would miss
    // it, but the order-independent fingerprint matches.
    expect(
      resolvePhantomConflict({
        writingFingerprint,
        remoteDoc: serialize(reordered),
        recentWrites: [],
      }),
    ).toBe("adopt");
  });

  it("overwrites when the remote holds an earlier write of ours", () => {
    // We're about to write a newer document, but the remote holds an earlier
    // one whose fingerprint is in our history — our own lost-response write.
    const newer = serialize({
      ...base,
      checklists: [
        { ...base.checklists[0]!, name: "Shopping" },
        base.checklists[1]!,
      ],
    });
    expect(
      resolvePhantomConflict({
        writingFingerprint: fingerprint(comparable(newer)),
        remoteDoc,
        recentWrites: [fingerprint(comparable(remoteDoc))],
      }),
    ).toBe("overwrite");
  });

  it("conflicts when the remote is a document this device never wrote", () => {
    const newer = serialize({
      ...base,
      checklists: [
        { ...base.checklists[0]!, name: "Shopping" },
        base.checklists[1]!,
      ],
    });
    expect(
      resolvePhantomConflict({
        writingFingerprint: fingerprint(comparable(newer)),
        remoteDoc,
        recentWrites: [],
      }),
    ).toBe("conflict");
  });

  it("treats adopt as taking precedence over a matching history entry", () => {
    // Even if the remote's fingerprint is also in the history, an exact match
    // with what we're writing is an adopt, not an overwrite.
    expect(
      resolvePhantomConflict({
        writingFingerprint,
        remoteDoc,
        recentWrites: [writingFingerprint],
      }),
    ).toBe("adopt");
  });
});
