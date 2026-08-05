// Browser back / forward across the app's own navigation. The app is a
// single page with no router: which list is open is device-local state
// (`use-checklist-lists.ts`), so opening one list after another used to be
// invisible to the browser and Back walked straight out of the app.
//
// This hook mirrors that state onto the History API. It never touches the
// URL — share payloads own the fragment, the deploy slots own the path, and
// GitHub Pages has no SPA rewrite for invented paths — so every entry is the
// same URL carrying a `NavDestination` in `history.state`.
//
// Two kinds of change reach the same destination, and only one of them is a
// navigation:
//
//   - a **gesture** (picking a list, opening a template, switching to the
//     archive) calls `markNavigation()` first, and the destination it lands
//     on is *pushed* as a new entry;
//   - **drift** — the selection settling after a document load, falling back
//     when the open list is archived or deleted, or a namespace restoring its
//     own cursor — *replaces* the current entry instead, so the history holds
//     only places the user actually chose to go, always up to date.
//
// A `popstate` applies the entry's destination through `apply` and marks it
// as already-current, so replaying it doesn't record anything new. Entries
// without our state (another feature's `pushState`, a restored session) are
// left alone.

import { useCallback, useEffect, useRef } from "react";

import type { View } from "../ui/nav-context.ts";

/** Where the app is: the namespace, the view, and what's open inside it. */
export interface NavDestination {
  /** The active namespace's slug — its document owns the ids below. */
  namespace: string;
  /** Which top-level view is showing. */
  view: View;
  /** The selected checklist. */
  listId: string;
  /** The template open on top of the selection, or null for none. */
  templateId: string | null;
}

/** The key our destination hides under in `history.state`. */
const STATE_KEY = "checklistNav";

/** True when two destinations describe the same place. */
export function sameDestination(a: NavDestination, b: NavDestination): boolean {
  return (
    a.namespace === b.namespace &&
    a.view === b.view &&
    a.listId === b.listId &&
    a.templateId === b.templateId
  );
}

/**
 * Read our destination out of a `history.state`, or null when the entry
 * isn't one of ours (another feature pushed it, or the browser restored a
 * session from before this shape existed).
 */
export function readNavDestination(state: unknown): NavDestination | null {
  if (typeof state !== "object" || state === null) return null;
  const raw = (state as Record<string, unknown>)[STATE_KEY];
  if (typeof raw !== "object" || raw === null) return null;
  const { namespace, view, listId, templateId } = raw as Record<
    string,
    unknown
  >;
  if (typeof namespace !== "string") return null;
  if (view !== "checklist" && view !== "archive") return null;
  if (typeof listId !== "string") return null;
  if (templateId !== null && typeof templateId !== "string") return null;
  return { namespace, view, listId, templateId };
}

/** Merge a destination into the current entry's state, keeping foreign keys. */
function withDestination(state: unknown, dest: NavDestination): unknown {
  const base = typeof state === "object" && state !== null ? state : {};
  return { ...base, [STATE_KEY]: dest };
}

export interface NavHistory {
  /**
   * Record that the destination change about to happen is a user navigation,
   * so it becomes a new history entry rather than an update of the current
   * one. Call it immediately before the verb that moves the app.
   */
  markNavigation: () => void;
}

export function useNavHistory(deps: {
  /** Where the app is right now. */
  destination: NavDestination;
  /**
   * Whether the document has loaded. Until it has, the selection is still
   * settling and nothing is worth recording.
   */
  ready: boolean;
  /** Put the app back at a destination the user navigated back (or forward) to. */
  apply: (dest: NavDestination) => void;
}): NavHistory {
  const { destination, ready, apply } = deps;

  // The destination the current history entry stands for; null until the
  // first one is recorded.
  const entryRef = useRef<NavDestination | null>(null);
  // Set by `markNavigation`, consumed by the next destination change.
  const navigatingRef = useRef(false);
  // Latest `apply` without re-subscribing the popstate listener every render.
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const markNavigation = useCallback(() => {
    navigatingRef.current = true;
  }, []);

  const { namespace, view, listId, templateId } = destination;
  useEffect(() => {
    if (!ready) return;
    const next: NavDestination = { namespace, view, listId, templateId };
    const entry = entryRef.current;
    if (entry && sameDestination(entry, next)) return;
    const state = withDestination(window.history.state, next);
    // The very first destination seeds the entry the app opened on — pushing
    // there would leave an empty entry behind the user's back.
    if (entry && navigatingRef.current) {
      window.history.pushState(state, "");
    } else {
      window.history.replaceState(state, "");
    }
    navigatingRef.current = false;
    entryRef.current = next;
  }, [ready, namespace, view, listId, templateId]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const dest = readNavDestination(event.state);
      if (!dest) return;
      // The entry we just landed on already describes where we're going, so
      // the state changes `apply` triggers must not record anything.
      entryRef.current = dest;
      navigatingRef.current = false;
      applyRef.current(dest);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return { markNavigation };
}
