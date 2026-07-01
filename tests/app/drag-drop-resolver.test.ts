// Unit coverage for the sidebar drag-drop resolver extracted from `App.tsx`.
// The parse → branch logic that maps a drag payload + drop-target key to an
// action was previously buried in a ref closure, reachable only by simulating
// drag events; here the whole drop-target matrix — including the illegal-drop
// no-ops — is exercised directly.
import { describe, expect, it } from "vitest";

import { resolveDragDrop } from "../../src/app/drag-drop-resolver.ts";
import {
  CHECKLIST_DROP_ARCHIVE,
  CHECKLIST_DROP_ROOT,
  checklistDropNamespaceKey,
  folderDragId,
} from "../../src/ui/checklist-drag-context.ts";

describe("resolveDragDrop", () => {
  describe("a dragged checklist", () => {
    it("files into the ungrouped zone (root → no folder)", () => {
      expect(resolveDragDrop("list-1", CHECKLIST_DROP_ROOT)).toEqual({
        type: "moveChecklistToFolder",
        checklistId: "list-1",
        folderId: null,
      });
    });

    it("archives on the Archive button", () => {
      expect(resolveDragDrop("list-1", CHECKLIST_DROP_ARCHIVE)).toEqual({
        type: "archiveChecklist",
        checklistId: "list-1",
      });
    });

    it("moves to a namespace on a namespace row", () => {
      expect(
        resolveDragDrop("list-1", checklistDropNamespaceKey("work")),
      ).toEqual({
        type: "moveChecklistToNamespace",
        checklistId: "list-1",
        slug: "work",
      });
    });

    it("files into a folder on any other key", () => {
      expect(resolveDragDrop("list-1", "folder-42")).toEqual({
        type: "moveChecklistToFolder",
        checklistId: "list-1",
        folderId: "folder-42",
      });
    });

    it("preserves an empty namespace slug", () => {
      expect(resolveDragDrop("list-1", checklistDropNamespaceKey(""))).toEqual({
        type: "moveChecklistToNamespace",
        checklistId: "list-1",
        slug: "",
      });
    });
  });

  describe("a dragged folder", () => {
    it("relocates the whole group on a namespace row", () => {
      expect(
        resolveDragDrop(
          folderDragId("folder-7"),
          checklistDropNamespaceKey("home"),
        ),
      ).toEqual({
        type: "moveFolderToNamespace",
        folderId: "folder-7",
        slug: "home",
      });
    });

    it("is a no-op over the ungrouped zone", () => {
      expect(
        resolveDragDrop(folderDragId("folder-7"), CHECKLIST_DROP_ROOT),
      ).toEqual({
        type: "none",
      });
    });

    it("is a no-op over the Archive button", () => {
      expect(
        resolveDragDrop(folderDragId("folder-7"), CHECKLIST_DROP_ARCHIVE),
      ).toEqual({ type: "none" });
    });

    it("is a no-op over another folder", () => {
      expect(resolveDragDrop(folderDragId("folder-7"), "folder-99")).toEqual({
        type: "none",
      });
    });
  });
});
