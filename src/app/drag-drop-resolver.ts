// Resolve a sidebar drag's drop target to the mutation it should trigger.
//
// A drop arrives as a raw drag payload (a bare checklist id, or a folder id
// under the `folder:` prefix — see `parseDragId`) plus the target's
// `data-checklist-drop` key. This pure function turns that pair into one of a
// closed set of `DragDropAction`s; `App.tsx` dispatches the action to the
// matching mutation. Keeping the parse → branch logic here (rather than inline
// in a ref closure) makes the drop-target matrix unit-testable without
// simulating drag events, and makes the legal-target set explicit:
//
//   - a dragged **checklist** files into the ungrouped zone (`CHECKLIST_DROP_ROOT`),
//     archives on the Archive button (`CHECKLIST_DROP_ARCHIVE`), moves on a
//     namespace row (`ns:<slug>`), or files into a folder (any other key);
//   - a dragged **folder** only resolves on a namespace row (it relocates the
//     whole group); over any other target it is a no-op (`{ type: "none" }`).

import {
  CHECKLIST_DROP_ARCHIVE,
  CHECKLIST_DROP_NS_PREFIX,
  CHECKLIST_DROP_ROOT,
  parseDragId,
} from "../ui/checklist-drag-context.ts";

export type DragDropAction =
  | { type: "none" }
  | { type: "moveFolderToNamespace"; folderId: string; slug: string }
  | {
      type: "moveChecklistToFolder";
      checklistId: string;
      folderId: string | null;
    }
  | { type: "archiveChecklist"; checklistId: string }
  | { type: "moveChecklistToNamespace"; checklistId: string; slug: string };

/** Resolve a raw drag payload + drop-target key to the action it should fire. */
export function resolveDragDrop(rawId: string, key: string): DragDropAction {
  const item = parseDragId(rawId);
  if (item.kind === "folder") {
    if (key.startsWith(CHECKLIST_DROP_NS_PREFIX)) {
      return {
        type: "moveFolderToNamespace",
        folderId: item.id,
        slug: key.slice(CHECKLIST_DROP_NS_PREFIX.length),
      };
    }
    // A folder dropped anywhere but a namespace row does nothing.
    return { type: "none" };
  }
  const checklistId = item.id;
  if (key === CHECKLIST_DROP_ROOT) {
    return { type: "moveChecklistToFolder", checklistId, folderId: null };
  }
  if (key === CHECKLIST_DROP_ARCHIVE) {
    return { type: "archiveChecklist", checklistId };
  }
  if (key.startsWith(CHECKLIST_DROP_NS_PREFIX)) {
    return {
      type: "moveChecklistToNamespace",
      checklistId,
      slug: key.slice(CHECKLIST_DROP_NS_PREFIX.length),
    };
  }
  return { type: "moveChecklistToFolder", checklistId, folderId: key };
}
