// The URL half of `use-nav-history.ts`: turning the app's destination into
// something the user can bookmark, copy into a note, or reopen on another of
// their devices — and reading one back when the app cold-starts on it.
//
// It lives in the **fragment**, never the path or the query string:
//
//   https://checklist.niclaslindstedt.se/#list=<id>
//   https://checklist.niclaslindstedt.se/#list=<id>&ns=work&view=archive
//
// The path is out because the deploy slots own it and GitHub Pages has no
// SPA rewrite — `/list/<id>` would 404 on reload. The query string is out
// because it is sent to the server on every request; a fragment never
// leaves the device, which is the same reason share payloads live there
// (see AGENTS.md "Shareable URLs"). A share payload is a bare base64url
// blob, so the two are told apart by shape: only a fragment carrying one of
// our `key=value` pairs is a destination, and anything else is left alone.
//
// The ids are the document's own — stable across the user's devices, since
// they travel with the synced document — so a bookmark opens the same list
// anywhere the same backend is configured. They mean nothing in *someone
// else's* app: this is a link to a list of yours, not a way to send a list
// to another person (that's what the share payload is for).

import { DEFAULT_NAMESPACE_SLUG } from "../storage/namespaces.ts";
import type { NavDestination } from "./use-nav-history.ts";

/** The parts of a destination a fragment can name. All optional but one. */
export interface NavUrlDestination {
  namespace?: string;
  view?: "checklist" | "archive";
  listId?: string;
  templateId?: string;
}

const KEYS = ["list", "ns", "template", "view"] as const;

/**
 * The fragment (without the leading `#`) that names a destination. The
 * defaults are left out so the common case stays short: the default
 * namespace, the checklist view, and no open template all go unwritten.
 */
export function destinationFragment(dest: NavDestination): string {
  const params = new URLSearchParams();
  params.set("list", dest.listId);
  if (dest.namespace !== DEFAULT_NAMESPACE_SLUG)
    params.set("ns", dest.namespace);
  if (dest.templateId) params.set("template", dest.templateId);
  if (dest.view !== "checklist") params.set("view", dest.view);
  return params.toString();
}

/**
 * Read a destination out of a fragment, or null when it isn't one of ours —
 * an empty fragment, or a share payload (a bare base64url blob carries none
 * of our keys).
 */
export function parseDestinationFragment(
  fragment: string,
): NavUrlDestination | null {
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (!KEYS.some((key) => params.has(key))) return null;
  const dest: NavUrlDestination = {};
  const list = params.get("list");
  if (list) dest.listId = list;
  const ns = params.get("ns");
  if (ns) dest.namespace = ns;
  const template = params.get("template");
  if (template) dest.templateId = template;
  const view = params.get("view");
  if (view === "archive" || view === "checklist") dest.view = view;
  return dest;
}

/** Fill a fragment's gaps from where the app is now. */
export function resolveUrlDestination(
  from: NavUrlDestination,
  current: NavDestination,
): NavDestination {
  return {
    namespace: from.namespace ?? current.namespace,
    view: from.view ?? "checklist",
    listId: from.listId ?? current.listId,
    templateId: from.templateId ?? null,
  };
}

/**
 * The full URL for a destination, preserving the path and query the app was
 * loaded with (the deploy slots live in the path; the native wrapper's
 * cold-start deep link may still be in the query).
 */
export function destinationUrl(
  location: { pathname: string; search: string },
  dest: NavDestination,
): string {
  const fragment = destinationFragment(dest);
  return `${location.pathname}${location.search}${fragment ? `#${fragment}` : ""}`;
}
