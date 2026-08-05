// Browser back / forward across the app's own navigation. The app is a
// single page with no router: which list is open is device-local state
// (`use-checklist-lists.ts`), so opening one list after another used to be
// invisible to the browser and Back walked straight out of the app.
//
// This hook mirrors that state onto the History API: every entry carries a
// `NavDestination` in `history.state`, and the address bar carries the same
// destination as a fragment (`#list=<id>`, see `nav-url.ts`) so the list on
// screen can be bookmarked, and a bookmark opens straight back into it.
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
//
// On the first pass the URL is read rather than written: a fragment naming a
// destination is applied (`source: "url"`), which is what makes a bookmark
// land on its list instead of on whichever list was open last. A fragment
// that isn't ours — a share payload — is left in the address bar untouched
// until the user's first navigation.

import { useCallback, useEffect, useRef, useState } from "react";

import type { View } from "../ui/nav-context.ts";
import {
  destinationUrl,
  parseDestinationFragment,
  resolveUrlDestination,
} from "./nav-url.ts";

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

/** Why `apply` is being called — a Back / Forward press, or the opening URL. */
export type NavSource = "popstate" | "url";

export function useNavHistory(deps: {
  /** Where the app is right now. */
  destination: NavDestination;
  /**
   * Whether the document has loaded. Until it has, the selection is still
   * settling and nothing is worth recording.
   */
  ready: boolean;
  /** Put the app at a destination it was sent to, by Back / Forward or by the URL. */
  apply: (dest: NavDestination, source: NavSource) => void;
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
  // Bumped after the opening URL is applied, to force one more pass. The app
  // may land somewhere other than where the URL pointed (a link to a list
  // that has since been deleted falls back to a real one) without the
  // destination changing at all, and that pass is what rewrites the address
  // bar to where the user actually is.
  const [urlPass, setUrlPass] = useState(0);

  const markNavigation = useCallback(() => {
    navigatingRef.current = true;
  }, []);

  const { namespace, view, listId, templateId } = destination;
  useEffect(() => {
    if (!ready) return;
    const next: NavDestination = { namespace, view, listId, templateId };
    const entry = entryRef.current;

    // First pass: the URL the app was opened with wins over the list the
    // cursor restored, so a bookmark lands where it points. Recording waits
    // for the app to settle there — this render is still showing the list it
    // started on.
    if (!entry) {
      const fromUrl = parseDestinationFragment(window.location.hash);
      if (fromUrl) {
        const target = resolveUrlDestination(fromUrl, next);
        entryRef.current = target;
        window.history.replaceState(
          withDestination(window.history.state, target),
          "",
        );
        applyRef.current(target, "url");
        setUrlPass(1);
        return;
      }
    }

    if (entry && sameDestination(entry, next)) return;
    const state = withDestination(window.history.state, next);
    // Leave a fragment that isn't ours (a share payload) in the address bar
    // until the user's first navigation — the app opened on it and nothing
    // has read it yet.
    const url =
      !entry &&
      window.location.hash &&
      !parseDestinationFragment(window.location.hash)
        ? null
        : destinationUrl(window.location, next);
    // The very first destination seeds the entry the app opened on — pushing
    // there would leave an empty entry behind the user's back.
    if (entry && navigatingRef.current) {
      window.history.pushState(state, "", url ?? undefined);
    } else {
      window.history.replaceState(state, "", url ?? undefined);
    }
    navigatingRef.current = false;
    entryRef.current = next;
  }, [ready, urlPass, namespace, view, listId, templateId]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const dest = readNavDestination(event.state);
      if (!dest) return;
      // The entry we just landed on already describes where we're going, so
      // the state changes `apply` triggers must not record anything.
      entryRef.current = dest;
      navigatingRef.current = false;
      applyRef.current(dest, "popstate");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return { markNavigation };
}
