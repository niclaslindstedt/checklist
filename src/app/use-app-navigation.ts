// The app's navigation wiring: what "where the user is" *means* at the root,
// and which gestures count as going somewhere. `use-nav-history.ts` owns the
// mechanics (history entries, the bookmarkable URL); this hook owns the
// mapping between them and the checklist / storage verbs, so the root
// component stays a thin composition (see `App.tsx`).
//
// It publishes three things:
//
//   - `verbs` — the checklist verbs that move the user, each wrapped to
//     record a history entry. App spreads them over the `ChecklistContext`
//     value, so the side menu, the search modal, and the archive navigate
//     through them without knowing any of this exists.
//   - `navigate` / `switchNamespace` — the same for the two verbs the root
//     owns itself.
//   - nothing else: applying a destination (Back / Forward, or the URL the
//     app was opened with) happens inside.
//
// **Cross-namespace destinations** are the one case that can't be applied in
// a single step: switching namespace swaps the whole document out, and the
// list a bookmark names only exists once that document has loaded (its own
// cursor would otherwise win the selection). Such a destination is held as
// `pending` and applied by an effect the moment the named list actually
// shows up in the snapshot. Any deliberate navigation drops it, so a
// bookmark that can no longer be resolved never hijacks a later selection.

import { useCallback, useEffect, useMemo, useState } from "react";

import { unlock } from "../achievements/index.ts";
import type { UseStorageBackend } from "../storage/useStorageBackend.ts";
import type { View } from "../ui/nav-context.ts";
import type { UseChecklist } from "./use-checklist.ts";
import {
  useNavHistory,
  type NavDestination,
  type NavSource,
} from "./use-nav-history.ts";

/** The checklist verbs App re-publishes so each one records a history entry. */
export interface NavVerbs {
  selectChecklist: (id: string) => void;
  selectTemplate: (id: string) => void;
  closeTemplate: () => void;
  addChecklist: () => void;
  createChecklistFromTemplate: (id: string) => void;
  unarchiveChecklist: (id: string) => void;
}

export interface AppNavigation {
  verbs: NavVerbs;
  /** Switch to a view and close the drawer. */
  navigate: (next: View) => void;
  /** Make a namespace active. */
  switchNamespace: (slug: string) => void;
}

export function useAppNavigation(deps: {
  checklist: UseChecklist;
  storage: UseStorageBackend;
  /** The view App is showing, and how to change it. */
  view: View;
  setView: (next: View) => void;
  /** Close the navigation drawer — arriving somewhere new always closes it. */
  closeMenu: () => void;
}): AppNavigation {
  const { checklist, storage, view, setView, closeMenu } = deps;
  const { activeChecklistId, activeTemplate, snapshot, loaded } = checklist;
  const { activeNamespace, switchNamespace } = storage;
  const {
    selectChecklist: selectChecklistNow,
    selectTemplate: selectTemplateNow,
  } = checklist;

  // A destination waiting for its namespace's document to arrive.
  const [pending, setPending] = useState<NavDestination | null>(null);

  const destination = useMemo<NavDestination>(
    () => ({
      namespace: activeNamespace,
      view,
      listId: activeChecklistId,
      templateId: activeTemplate?.id ?? null,
    }),
    [activeNamespace, view, activeChecklistId, activeTemplate],
  );

  const applyDestination = useCallback(
    (dest: NavDestination, source: NavSource) => {
      // Back / Forward is the trophy; opening a link is its own. The trail
      // itself is recorded without ever going through here. Spelled as two
      // literal calls so the catalog's wiring check can find them.
      if (source === "popstate") unlock("retracedSteps");
      else unlock("deepLinked");
      setView(dest.view);
      closeMenu();
      if (dest.namespace !== activeNamespace) {
        // The named list belongs to a document that isn't loaded yet.
        switchNamespace(dest.namespace);
        setPending(dest);
        return;
      }
      // Selecting the list first clears any open template, so a destination
      // that had one re-opens it on top of the right list.
      selectChecklistNow(dest.listId);
      if (dest.templateId) selectTemplateNow(dest.templateId);
    },
    [
      activeNamespace,
      switchNamespace,
      selectChecklistNow,
      selectTemplateNow,
      setView,
      closeMenu,
    ],
  );

  const { markNavigation } = useNavHistory({
    destination,
    ready: loaded,
    apply: applyDestination,
  });

  // Finish a cross-namespace destination once the list it names is really
  // there. Until then the namespace's own cursor holds the selection, which
  // is also where things stay if the list turns out to be gone.
  useEffect(() => {
    if (!pending) return;
    if (pending.namespace !== activeNamespace) return;
    if (!snapshot.checklists.some((c) => c.id === pending.listId)) return;
    selectChecklistNow(pending.listId);
    if (pending.templateId) selectTemplateNow(pending.templateId);
    setPending(null);
  }, [
    pending,
    activeNamespace,
    snapshot,
    selectChecklistNow,
    selectTemplateNow,
  ]);

  // Any deliberate move is the user overtaking a destination still waiting
  // to resolve, so it drops.
  const mark = useCallback(() => {
    setPending(null);
    markNavigation();
  }, [markNavigation]);

  const verbs = useMemo<NavVerbs>(
    () => ({
      selectChecklist: (id: string) => {
        if (id !== checklist.activeChecklistId) mark();
        checklist.selectChecklist(id);
      },
      selectTemplate: (id: string) => {
        if (id !== checklist.activeTemplate?.id) mark();
        checklist.selectTemplate(id);
      },
      closeTemplate: () => {
        if (checklist.activeTemplate) mark();
        checklist.closeTemplate();
      },
      addChecklist: () => {
        mark();
        checklist.addChecklist();
      },
      createChecklistFromTemplate: (id: string) => {
        mark();
        checklist.createChecklistFromTemplate(id);
      },
      unarchiveChecklist: (id: string) => {
        mark();
        checklist.unarchiveChecklist(id);
      },
    }),
    [checklist, mark],
  );

  const navigate = useCallback(
    (next: View) => {
      if (next !== view) mark();
      setView(next);
      closeMenu();
    },
    [view, mark, setView, closeMenu],
  );

  const switchNamespaceNav = useCallback(
    (slug: string) => {
      if (slug !== activeNamespace) mark();
      switchNamespace(slug);
    },
    [activeNamespace, switchNamespace, mark],
  );

  return useMemo(
    () => ({ verbs, navigate, switchNamespace: switchNamespaceNav }),
    [verbs, navigate, switchNamespaceNav],
  );
}
