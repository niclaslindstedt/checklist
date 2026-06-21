import { describe, expect, it } from "vitest";

import {
  addFolder,
  checklistsInFolder,
  createFolder,
  folders,
  removeFolder,
  renameFolder,
  renameFolderInSnapshot,
  setChecklistFolder,
  sortFoldersByCreated,
} from "../../src/domain/folders.ts";
import type { Checklist, Folder, Snapshot } from "../../src/domain/types.ts";

function list(id: string, folderId?: string): Checklist {
  return {
    version: 1,
    id,
    templateId: "",
    name: id,
    items: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(folderId ? { folderId } : {}),
  };
}

const folderA: Folder = {
  id: "f-a",
  name: "Work",
  createdAt: "2026-01-01T00:00:00.000Z",
};
const folderB: Folder = {
  id: "f-b",
  name: "Home",
  createdAt: "2026-01-02T00:00:00.000Z",
};

describe("folder domain", () => {
  it("creates a trimmed folder stamped at now", () => {
    const f = createFolder("f-1", "  Recipes  ", "2026-02-01T00:00:00.000Z");
    expect(f).toEqual({
      id: "f-1",
      name: "Recipes",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("renames a folder, ignoring a blank or unchanged name", () => {
    expect(renameFolder(folderA, "Office").name).toBe("Office");
    expect(renameFolder(folderA, "  Office  ").name).toBe("Office");
    expect(renameFolder(folderA, "   ")).toBe(folderA);
    expect(renameFolder(folderA, "Work")).toBe(folderA);
  });

  it("sorts folders by creation order, oldest first, without mutating", () => {
    const input = [folderB, folderA];
    const sorted = sortFoldersByCreated(input);
    expect(sorted.map((f) => f.id)).toEqual(["f-a", "f-b"]);
    expect(input.map((f) => f.id)).toEqual(["f-b", "f-a"]);
  });

  it("reads folders from a snapshot oldest-first", () => {
    const snap: Snapshot = {
      templates: [],
      checklists: [],
      folders: [folderB, folderA],
    };
    expect(folders(snap).map((f) => f.id)).toEqual(["f-a", "f-b"]);
    expect(folders({ templates: [], checklists: [] })).toEqual([]);
  });

  it("buckets checklists by folder, with null for ungrouped", () => {
    const lists = [list("1", "f-a"), list("2"), list("3", "f-a")];
    expect(checklistsInFolder(lists, "f-a").map((c) => c.id)).toEqual([
      "1",
      "3",
    ]);
    expect(checklistsInFolder(lists, null).map((c) => c.id)).toEqual(["2"]);
  });

  it("moves a checklist into / out of a folder without churning a no-op", () => {
    const c = list("1");
    const moved = setChecklistFolder(c, "f-a");
    expect(moved.folderId).toBe("f-a");
    expect(setChecklistFolder(moved, "f-a")).toBe(moved);
    const out = setChecklistFolder(moved, null);
    expect(out.folderId).toBeUndefined();
    expect(setChecklistFolder(c, undefined)).toBe(c);
  });

  it("leaves updatedAt untouched when moving between folders", () => {
    const c = list("1");
    expect(setChecklistFolder(c, "f-a").updatedAt).toBe(c.updatedAt);
  });

  it("adds a folder idempotently, replacing a same-id entry", () => {
    const snap: Snapshot = { templates: [], checklists: [] };
    const once = addFolder(snap, folderA);
    expect(once.folders).toEqual([folderA]);
    const renamed = { ...folderA, name: "Office" };
    const twice = addFolder(once, renamed);
    expect(twice.folders).toEqual([renamed]);
  });

  it("removes a folder and un-groups its checklists, keeping the lists", () => {
    const snap: Snapshot = {
      templates: [],
      checklists: [list("1", "f-a"), list("2", "f-b")],
      folders: [folderA, folderB],
    };
    const next = removeFolder(snap, "f-a");
    expect(next.folders).toEqual([folderB]);
    expect(next.checklists.find((c) => c.id === "1")?.folderId).toBeUndefined();
    expect(next.checklists.find((c) => c.id === "2")?.folderId).toBe("f-b");
    expect(next.checklists).toHaveLength(2);
  });

  it("drops the folders key entirely when the last folder is removed", () => {
    const snap: Snapshot = {
      templates: [],
      checklists: [list("1", "f-a")],
      folders: [folderA],
    };
    const next = removeFolder(snap, "f-a");
    expect("folders" in next).toBe(false);
  });

  it("removeFolder is a no-op for an unknown id", () => {
    const snap: Snapshot = {
      templates: [],
      checklists: [],
      folders: [folderA],
    };
    expect(removeFolder(snap, "nope")).toBe(snap);
  });

  it("renames a folder in the snapshot registry", () => {
    const snap: Snapshot = {
      templates: [],
      checklists: [],
      folders: [folderA, folderB],
    };
    const next = renameFolderInSnapshot(snap, "f-a", "Office");
    expect(next.folders?.find((f) => f.id === "f-a")?.name).toBe("Office");
    expect(renameFolderInSnapshot(snap, "f-a", "Work")).toBe(snap);
    expect(renameFolderInSnapshot(snap, "nope", "X")).toBe(snap);
  });
});
