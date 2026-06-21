// Pure operations over Folders — the named buckets that group checklists
// within a single namespace. Like `checklists.ts` and `templates.ts`, callers
// supply ids and timestamps so every function is deterministic and DOM-free
// (no imports from ui/, storage/, the DOM, or fetch — see AGENTS.md).
//
// A folder lives in the `Snapshot`'s `folders` registry; a checklist points at
// one by `Checklist.folderId`. The registry holds folder names and lets an
// empty folder (one no checklist references yet) persist. Moving a checklist
// between folders only flips its `folderId` — it never touches the registry.

import type { Checklist, Folder, Snapshot } from "./types.ts";

/** Create an empty folder named `name`, stamped at `now`. The name is trimmed. */
export function createFolder(id: string, name: string, now: string): Folder {
  return { id, name: name.trim(), createdAt: now };
}

/** Rename a folder, trimming the new name. A blank name leaves it untouched. */
export function renameFolder(folder: Folder, name: string): Folder {
  const trimmed = name.trim();
  if (!trimmed || trimmed === folder.name) return folder;
  return { ...folder, name: trimmed };
}

/** Folders in stable creation order (oldest first). Never mutates the input. */
export function sortFoldersByCreated(folders: readonly Folder[]): Folder[] {
  return [...folders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The folders defined in a namespace, oldest first. Empty when none exist. */
export function folders(snapshot: Snapshot): Folder[] {
  return sortFoldersByCreated(snapshot.folders ?? []);
}

/**
 * The checklists that sit directly in `folderId` (or the ungrouped ones when
 * `null`), in document order. Archived lists are included — callers filter
 * those out for the switcher; the archive view wants them grouped too.
 */
export function checklistsInFolder(
  lists: readonly Checklist[],
  folderId: string | null,
): Checklist[] {
  if (folderId === null) return lists.filter((c) => !c.folderId);
  return lists.filter((c) => c.folderId === folderId);
}

/**
 * Return a copy of `checklist` moved into `folderId` (or out of any folder
 * when `folderId` is undefined / null). `updatedAt` is left untouched: moving
 * a list between folders is an organisational change, not an edit, so it keeps
 * its place in the most-recently-edited ordering rather than jumping to the
 * top. Returns the same reference when the folder doesn't actually change so a
 * no-op move doesn't churn identity (or bump the save).
 */
export function setChecklistFolder(
  checklist: Checklist,
  folderId: string | null | undefined,
): Checklist {
  const target = folderId || undefined;
  if ((checklist.folderId || undefined) === target) return checklist;
  const next: Checklist = { ...checklist };
  if (target) next.folderId = target;
  else delete next.folderId;
  return next;
}

/**
 * Remove a folder from the snapshot's registry and un-group every checklist
 * that pointed at it (they drop back to the top level — deleting a folder
 * never destroys the lists inside it). Returns the same snapshot reference
 * when the folder isn't present.
 */
export function removeFolder(snapshot: Snapshot, folderId: string): Snapshot {
  const registry = snapshot.folders ?? [];
  if (!registry.some((f) => f.id === folderId)) return snapshot;
  const nextFolders = registry.filter((f) => f.id !== folderId);
  const next: Snapshot = {
    ...snapshot,
    checklists: snapshot.checklists.map((c) =>
      c.folderId === folderId ? setChecklistFolder(c, null) : c,
    ),
  };
  if (nextFolders.length > 0) next.folders = nextFolders;
  else delete next.folders;
  return next;
}

/**
 * Add `folder` to the snapshot's registry (appended). Replaces an existing
 * entry with the same id rather than duplicating it, so a re-add is idempotent.
 */
export function addFolder(snapshot: Snapshot, folder: Folder): Snapshot {
  const registry = snapshot.folders ?? [];
  const without = registry.filter((f) => f.id !== folder.id);
  return { ...snapshot, folders: [...without, folder] };
}

/**
 * Apply `rename` to the folder with `id` in the registry. Returns the same
 * snapshot reference when the id isn't present or the name didn't change.
 */
export function renameFolderInSnapshot(
  snapshot: Snapshot,
  id: string,
  name: string,
): Snapshot {
  const registry = snapshot.folders ?? [];
  let changed = false;
  const nextFolders = registry.map((f) => {
    if (f.id !== id) return f;
    const renamed = renameFolder(f, name);
    if (renamed !== f) changed = true;
    return renamed;
  });
  return changed ? { ...snapshot, folders: nextFolders } : snapshot;
}
