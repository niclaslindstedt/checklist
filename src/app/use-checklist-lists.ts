// The checklist *collection* verbs: selecting which checklist is active,
// adding a new one, and renaming one. Where `use-checklist-edits.ts` mutates
// the items *inside* the active list, this hook owns the document's
// `checklists[]` array and the device-local "which list am I looking at"
// selection.
//
// Kept as its own concern-scoped hook (like the edit verbs and the
// persistence engine) so a new list-management feature lands here rather
// than swelling the central `use-checklist.ts` composer. The persistence
// engine (`setDoc` / `scheduleSave`) and the undo timeline (`record`) are
// threaded in; the active-selection state lives here — it is a property of this
// view, not of the persisted document. It is mirrored to a device-local,
// per-namespace cursor (`getActiveChecklistId` / `setActiveChecklistId`) so a
// reload or an app update lands back on the same list instead of snapping to
// the first one. A cursor that no longer resolves (the list was archived or
// removed elsewhere) silently falls back to the first active list.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { unlock } from "../achievements/bus.ts";
import {
  createChecklist,
  emptyArchive as emptyArchiveOp,
  nextChecklistName,
  progress,
  renameChecklist as renameChecklistOp,
  setChecklistAppearance as setChecklistAppearanceOp,
  setChecklistArchived,
} from "../domain/checklists.ts";
import {
  addFolder,
  createFolder as createFolderOp,
  removeFolder as removeFolderOp,
  renameFolderInSnapshot,
  setChecklistFolder,
  sortFoldersByCreated,
} from "../domain/folders.ts";
import type {
  Checklist,
  ChecklistAppearance,
  Snapshot,
} from "../domain/types.ts";
import type { TFunction } from "../i18n";
import {
  getActiveChecklistId,
  setActiveChecklistId,
} from "../storage/namespaces.ts";
import type { Notify } from "./notify.ts";
import { DEFAULT_LIST_NAME } from "./use-checklist-sync.ts";
import { newId, now } from "./side-effects.ts";

/** A lightweight summary of one checklist, for the side-menu switcher. */
export interface ChecklistSummary {
  id: string;
  name: string;
  /** Active (non-archived) items still unchecked — the switcher's badge. */
  remaining: number;
  /** The folder this list is grouped under, or undefined when ungrouped. */
  folderId?: string;
}

/** A lightweight summary of one folder, for the side-menu's folder groups. */
export interface FolderSummary {
  id: string;
  name: string;
  /** How many active (non-archived) checklists sit in this folder. */
  count: number;
}

export interface ChecklistLists {
  /** The checklist the views currently render and the edit verbs mutate. */
  activeList: Checklist;
  /** The id of {@link activeList}. */
  activeChecklistId: string;
  /** Every active (non-archived) checklist, in document order — the switcher. */
  checklists: ChecklistSummary[];
  /**
   * The archived checklists, in document order — what the archive view lists
   * under its "Archived lists" section so each can be restored or deleted as
   * a whole.
   */
  archivedChecklists: ChecklistSummary[];
  /** Make a checklist active (the side-menu switcher). */
  selectChecklist: (id: string) => void;
  /** Append a fresh, default-named checklist and switch to it. */
  addChecklist: () => void;
  /** Rename a checklist (the clickable header title). */
  renameChecklist: (id: string, name: string) => void;
  /**
   * Set (or, with `null` fields, clear) a checklist's icon and/or accent
   * colour — the header glyph picker. Applies live and persists like any
   * other list edit; a no-op change never writes.
   */
  setChecklistAppearance: (id: string, patch: ChecklistAppearance) => void;
  /**
   * Remove a checklist from the document. A no-op when it would leave no
   * active list behind (the views always need one to show). Recoverable via
   * undo — `commit` records the whole document on the timeline.
   */
  removeChecklist: (id: string) => void;
  /**
   * Archive a whole checklist — it leaves the switcher and the checklist view
   * and surfaces in the archive's "Archived lists" section. A no-op when it
   * would leave no active list behind. Recoverable via undo (and via the
   * archive's restore action).
   */
  archiveChecklist: (id: string) => void;
  /** Restore an archived checklist back into the switcher and select it. */
  unarchiveChecklist: (id: string) => void;
  /**
   * Permanently empty the archive in one sweep — drop every archived
   * checklist and every archived item across the document, the bulk
   * counterpart to the archive view's per-row Delete. A no-op when nothing is
   * archived. Recoverable via undo (`commit` records the whole document).
   */
  emptyArchive: () => void;
  /** The folders defined in this namespace, oldest first, with their counts. */
  folders: FolderSummary[];
  /** Create a new, empty folder and add it to the registry. */
  createFolder: (name: string) => void;
  /** Rename a folder in place. A blank or unchanged name is a no-op. */
  renameFolder: (id: string, name: string) => void;
  /**
   * Remove a folder. The checklists inside it aren't destroyed — they drop
   * back to the top level (ungrouped). Recoverable via undo.
   */
  removeFolder: (id: string) => void;
  /** Move a checklist into a folder (or out of any folder when `null`). */
  moveChecklistToFolder: (id: string, folderId: string | null) => void;
  /** Append a fresh checklist already filed inside `folderId`, and select it. */
  addChecklistInFolder: (folderId: string) => void;
  /**
   * Drop a checklist from this namespace's document after its bytes have been
   * written into another namespace (the sidebar drag-to-namespace move — the
   * storage write happens in `App`). Records the removal on the undo timeline
   * under a "moved" label and re-points the selection. A no-op when it would
   * leave no active list behind (the caller guards this too, before writing).
   */
  detachChecklistToNamespace: (id: string, namespaceName: string) => void;
  /**
   * Drop a folder and every checklist filed inside it from this namespace's
   * document, after its contents have been written into another namespace (the
   * sidebar drag-a-folder-to-namespace move — the storage write happens in
   * `App`). Records the removal on the undo timeline under a "moved" label and
   * re-points the selection if the open list moved. A no-op when it would leave
   * no active list behind (the caller guards this too, before writing).
   */
  detachFolderToNamespace: (folderId: string, namespaceName: string) => void;
}

export function useChecklistLists(deps: {
  /** The full in-memory document. */
  doc: Snapshot;
  /** Latest document, read when folding a list edit into the snapshot. */
  docRef: MutableRefObject<Snapshot>;
  /** Swap the visible document for an immediate re-render. */
  setDoc: (next: Snapshot) => void;
  /** Persist the edited document (debounced by the active backend). */
  scheduleSave: (next: Snapshot) => void;
  /** Record the post-edit document — tagged with its action label — on the undo timeline. */
  record: (next: Snapshot, label: string) => void;
  /** Raise a toast for an action whose result the user can't immediately see. */
  notify: Notify;
  /** Translator for the action labels (also reused as the toast text). */
  t: TFunction;
  /**
   * The active namespace's slug. Scopes the device-local active-list cursor so
   * each namespace remembers its own selection across reloads and app updates.
   */
  namespace: string;
}): ChecklistLists {
  const { doc, docRef, setDoc, scheduleSave, record, notify, t, namespace } =
    deps;

  // Which list the user is looking at. Device-local, restored from the
  // per-namespace cursor on mount: a selection that points at no surviving list
  // (after a reload or a backend swap brought in a different document) silently
  // falls back to the first.
  const [activeId, setActiveIdState] = useState<string | null>(() =>
    getActiveChecklistId(namespace),
  );

  // Persist every selection change so a reload / app update lands back on it.
  const setActiveId = useCallback(
    (id: string | null) => {
      setActiveIdState(id);
      setActiveChecklistId(namespace, id);
    },
    [namespace],
  );

  // Switching namespace swaps the underlying document; restore that
  // namespace's own cursor rather than carrying the previous one over.
  const lastNamespace = useRef(namespace);
  useEffect(() => {
    if (lastNamespace.current === namespace) return;
    lastNamespace.current = namespace;
    setActiveIdState(getActiveChecklistId(namespace));
  }, [namespace]);

  // The sync engine guarantees the document always has at least one list
  // (`withActiveList`); the archive/delete verbs guarantee at least one is
  // *active*. Resolve the selection against the active lists, falling back to
  // the first active one (then, defensively, the first list of all).
  const activeList =
    doc.checklists.find((c) => c.id === activeId && !c.archived) ??
    doc.checklists.find((c) => !c.archived) ??
    doc.checklists[0]!;

  const commit = useCallback(
    (next: Snapshot, label: string) => {
      setDoc(next);
      scheduleSave(next);
      record(next, label);
    },
    [setDoc, scheduleSave, record],
  );

  const selectChecklist = useCallback(
    (id: string) => setActiveId(id),
    [setActiveId],
  );

  const addChecklist = useCallback(() => {
    const prev = docRef.current;
    const created = createChecklist(
      newId(),
      nextChecklistName(prev.checklists, DEFAULT_LIST_NAME),
      now(),
    );
    // No toast: the switcher jumps to the fresh, visibly-empty list.
    commit(
      { ...prev, checklists: [...prev.checklists, created] },
      t("toast.listCreated", { name: created.name }),
    );
    setActiveId(created.id);
  }, [docRef, commit, t, setActiveId]);

  const renameChecklist = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const prev = docRef.current;
      unlock("renamed");
      // No toast: the header title updates in place.
      commit(
        {
          ...prev,
          checklists: prev.checklists.map((c) =>
            c.id === id ? renameChecklistOp(c, trimmed, now()) : c,
          ),
        },
        t("toast.listRenamed", { name: trimmed }),
      );
    },
    [docRef, commit, t],
  );

  const setChecklistAppearance = useCallback(
    (id: string, patch: ChecklistAppearance) => {
      const prev = docRef.current;
      let changed = false;
      const checklists = prev.checklists.map((c) => {
        if (c.id !== id) return c;
        const next = setChecklistAppearanceOp(c, patch, now());
        if (next !== c) changed = true;
        return next;
      });
      if (!changed) return;
      // No toast: the header glyph updates in place as the user picks. The
      // "List Stylist" trophy fires from a derived predicate over the document
      // gaining its first styled list (see the catalog).
      commit({ ...prev, checklists }, t("toast.listRestyled"));
    },
    [docRef, commit, t],
  );

  const removeChecklist = useCallback(
    (id: string) => {
      const prev = docRef.current;
      const remaining = prev.checklists.filter((c) => c.id !== id);
      if (remaining.length === prev.checklists.length) return;
      // The views always need at least one *active* list to render — refuse a
      // removal that would leave none (the side menu also hides the
      // affordance). Deleting an archived list never trips this, since the
      // list being viewed is active and survives.
      if (!remaining.some((c) => !c.archived)) return;
      const name = prev.checklists.find((c) => c.id === id)?.name ?? "";
      const label = t("toast.listDeleted", { name });
      commit({ ...prev, checklists: remaining }, label);
      notify(label);
      unlock("cleanSlate");
      // Removing the explicitly-selected list re-points the selection at the
      // first active survivor; an unset selection already falls back to it.
      if (id === activeId) {
        setActiveId(remaining.find((c) => !c.archived)?.id ?? null);
      }
    },
    [docRef, commit, notify, t, activeId, setActiveId],
  );

  const archiveChecklist = useCallback(
    (id: string) => {
      const prev = docRef.current;
      const target = prev.checklists.find((c) => c.id === id);
      if (!target || target.archived) return;
      // Never archive the last active list — the view needs one to show.
      if (prev.checklists.filter((c) => !c.archived).length <= 1) return;
      const label = t("toast.listArchived", { name: target.name });
      commit(
        {
          ...prev,
          checklists: prev.checklists.map((c) =>
            c.id === id ? setChecklistArchived(c, true, now()) : c,
          ),
        },
        label,
      );
      notify(label);
      // The "Tidy Shelves" trophy fires from a derived predicate over the
      // document gaining its first archived list (see the catalog).
      // Archiving the selected list re-points the selection at the first
      // remaining active list, so the view never lands on a hidden one.
      if (id === activeId) {
        setActiveId(
          prev.checklists.find((c) => !c.archived && c.id !== id)?.id ?? null,
        );
      }
    },
    [docRef, commit, notify, t, activeId, setActiveId],
  );

  const unarchiveChecklist = useCallback(
    (id: string) => {
      const prev = docRef.current;
      const target = prev.checklists.find((c) => c.id === id);
      if (!target || !target.archived) return;
      const label = t("toast.listRestored", { name: target.name });
      commit(
        {
          ...prev,
          checklists: prev.checklists.map((c) =>
            c.id === id ? setChecklistArchived(c, false, now()) : c,
          ),
        },
        label,
      );
      notify(label, "success");
      // Jump straight to the freshly-restored list, the way adding one does.
      setActiveId(id);
    },
    [docRef, commit, notify, t, setActiveId],
  );

  const emptyArchive = useCallback(() => {
    const prev = docRef.current;
    const next = emptyArchiveOp(prev, now());
    // Nothing archived anywhere — leave the document (and the undo timeline)
    // untouched so the gesture is a true no-op. Emptying only drops archived
    // things, so the active list always survives and the selection stays put.
    if (next === prev) return;
    const label = t("toast.archiveEmptied");
    commit(next, label);
    notify(label);
    unlock("archiveEmptied");
  }, [docRef, commit, notify, t]);

  const createFolder = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const prev = docRef.current;
      const folder = createFolderOp(newId(), trimmed, now());
      // No toast: the new folder appears in the sidebar list in place.
      commit(
        addFolder(prev, folder),
        t("toast.folderCreated", { name: trimmed }),
      );
    },
    [docRef, commit, t],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const prev = docRef.current;
      const next = renameFolderInSnapshot(prev, id, trimmed);
      if (next === prev) return;
      commit(next, t("toast.folderRenamed", { name: trimmed }));
    },
    [docRef, commit, t],
  );

  const removeFolder = useCallback(
    (id: string) => {
      const prev = docRef.current;
      const target = (prev.folders ?? []).find((f) => f.id === id);
      if (!target) return;
      const next = removeFolderOp(prev, id);
      const label = t("toast.folderDeleted", { name: target.name });
      commit(next, label);
      notify(label);
    },
    [docRef, commit, notify, t],
  );

  const moveChecklistToFolder = useCallback(
    (id: string, folderId: string | null) => {
      const prev = docRef.current;
      let changed = false;
      const checklists = prev.checklists.map((c) => {
        if (c.id !== id) return c;
        const moved = setChecklistFolder(c, folderId);
        if (moved !== c) changed = true;
        return moved;
      });
      if (!changed) return;
      const name =
        folderId === null
          ? null
          : ((prev.folders ?? []).find((f) => f.id === folderId)?.name ?? null);
      const label =
        name === null
          ? t("toast.listUnfiled")
          : t("toast.listMovedToFolder", { name });
      commit({ ...prev, checklists }, label);
    },
    [docRef, commit, t],
  );

  const addChecklistInFolder = useCallback(
    (folderId: string) => {
      const prev = docRef.current;
      const created = setChecklistFolder(
        createChecklist(
          newId(),
          nextChecklistName(prev.checklists, DEFAULT_LIST_NAME),
          now(),
        ),
        folderId,
      );
      commit(
        { ...prev, checklists: [...prev.checklists, created] },
        t("toast.listCreated", { name: created.name }),
      );
      setActiveId(created.id);
    },
    [docRef, commit, t, setActiveId],
  );

  const detachChecklistToNamespace = useCallback(
    (id: string, namespaceName: string) => {
      const prev = docRef.current;
      const remaining = prev.checklists.filter((c) => c.id !== id);
      if (remaining.length === prev.checklists.length) return;
      // The views always need at least one *active* list to render — refuse a
      // move that would strip this namespace of its last one. (App guards this
      // before the target write, so this is the belt-and-braces backstop.)
      if (!remaining.some((c) => !c.archived)) return;
      // The list lives on in the target namespace now, so frame the undo entry
      // as a move rather than a deletion. Undo restores the local copy; the
      // copy already written into the target namespace is left in place.
      commit(
        { ...prev, checklists: remaining },
        t("toast.listMovedToNamespace", { name: namespaceName }),
      );
      if (id === activeId) {
        setActiveId(remaining.find((c) => !c.archived)?.id ?? null);
      }
    },
    [docRef, commit, t, activeId, setActiveId],
  );

  const detachFolderToNamespace = useCallback(
    (folderId: string, namespaceName: string) => {
      const prev = docRef.current;
      const inFolder = prev.checklists.filter((c) => c.folderId === folderId);
      const remaining = prev.checklists.filter((c) => c.folderId !== folderId);
      // The views always need at least one *active* list to render — refuse a
      // move that would strip this namespace of its last one. (App guards this
      // before the target write, so this is the belt-and-braces backstop.)
      if (!remaining.some((c) => !c.archived)) return;
      // Drop the folder from the registry too — it lives on in the target now.
      const registry = prev.folders ?? [];
      const nextFolders = registry.filter((f) => f.id !== folderId);
      const next: Snapshot = { ...prev, checklists: remaining };
      if (nextFolders.length > 0) next.folders = nextFolders;
      else delete next.folders;
      // The folder and its lists live on in the target namespace, so frame the
      // undo entry as a move. Undo restores the local copies; the copies already
      // written into the target are left in place.
      commit(next, t("toast.folderMovedToNamespace", { name: namespaceName }));
      if (inFolder.some((c) => c.id === activeId)) {
        setActiveId(remaining.find((c) => !c.archived)?.id ?? null);
      }
    },
    [docRef, commit, t, activeId, setActiveId],
  );

  const summarize = (c: Checklist): ChecklistSummary => {
    const { checked, total } = progress(c);
    const summary: ChecklistSummary = {
      id: c.id,
      name: c.name,
      remaining: total - checked,
    };
    if (c.folderId) summary.folderId = c.folderId;
    return summary;
  };

  const checklists = useMemo(
    () => doc.checklists.filter((c) => !c.archived).map(summarize),
    [doc.checklists],
  );

  const archivedChecklists = useMemo(
    () => doc.checklists.filter((c) => c.archived).map(summarize),
    [doc.checklists],
  );

  // Folder groups for the sidebar: the registry in creation order, each
  // tagged with how many active lists it holds. Empty folders are kept (they
  // live in the registry, not derived from the lists), so a freshly-made
  // folder shows up before anything is filed into it.
  const folders = useMemo<FolderSummary[]>(() => {
    const active = doc.checklists.filter((c) => !c.archived);
    return sortFoldersByCreated(doc.folders ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      count: active.filter((c) => c.folderId === f.id).length,
    }));
  }, [doc.folders, doc.checklists]);

  return useMemo(
    () => ({
      activeList,
      activeChecklistId: activeList.id,
      checklists,
      archivedChecklists,
      selectChecklist,
      addChecklist,
      renameChecklist,
      setChecklistAppearance,
      removeChecklist,
      archiveChecklist,
      unarchiveChecklist,
      emptyArchive,
      folders,
      createFolder,
      renameFolder,
      removeFolder,
      moveChecklistToFolder,
      addChecklistInFolder,
      detachChecklistToNamespace,
      detachFolderToNamespace,
    }),
    [
      activeList,
      checklists,
      archivedChecklists,
      selectChecklist,
      addChecklist,
      renameChecklist,
      setChecklistAppearance,
      removeChecklist,
      archiveChecklist,
      unarchiveChecklist,
      emptyArchive,
      folders,
      createFolder,
      renameFolder,
      removeFolder,
      moveChecklistToFolder,
      addChecklistInFolder,
      detachChecklistToNamespace,
      detachFolderToNamespace,
    ],
  );
}
