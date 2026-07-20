// The compact, read-optimised projection of a checklist document that the
// native Home Screen / Lock Screen widgets render. Widgets run in a separate
// OS process (WidgetKit on iOS, Glance on Android) that cannot reach the
// WebView's `localStorage` where the real document lives, so the app mirrors
// this derived snapshot out to a shared container on every persist and the
// widget reads it there. Kept platform-neutral (plain JSON, no DOM, no
// native types) so a single format serves both platforms — see the widgets
// work in #263.
//
// This is a *derived* view: the WebView's storage stays the single source of
// truth, and the snapshot carries only what a widget needs to draw a glance —
// the active list's progress and next open items, a per-list summary for the
// configurable list picker, and the due-today / overdue items across every
// list. Recurrence is resolved to each item's next real occurrence so a
// missed recurring task still reads as due rather than stuck in the past.
//
// Pure, like the rest of `domain/`: the caller supplies the `now` instant, so
// which items count as "due today" depends solely on the arguments.

import { activeItems } from "./archive-ops.ts";
import { deadlineStatus, nextOccurrence } from "./deadlines.ts";
import { displayItems, progress } from "./item-display.ts";
import { findItem, flattenItems } from "./item-tree.ts";
import { toggleItem } from "./item-ops.ts";
import type { Checklist, Snapshot } from "./types.ts";

/** The current widget-snapshot format version, bumped on a breaking shape change. */
export const WIDGET_SNAPSHOT_VERSION = 1 as const;

/** How many open items the active-list projection carries by default. */
export const DEFAULT_WIDGET_ITEM_LIMIT = 8;

/** A single open item as a widget row: enough to render and to act on. */
export interface WidgetItemView {
  /** The item's stable id — echoed back in a check-off {@link WidgetAction}. */
  id: string;
  title: string;
  /** The item's due day (`YYYY-MM-DD`), resolved to its next occurrence if it recurs. */
  deadline?: string;
}

/** A whole list reduced to what a picker row or a progress ring needs. */
export interface WidgetListSummary {
  id: string;
  name: string;
  /** The list's chosen glyph name, if any (see `Checklist.glyph`). */
  glyph?: string;
  /** The list's accent colour, if any (see `Checklist.color`). */
  color?: string;
  /** Visible (non-archived) items, sub-items included. */
  total: number;
  /** How many of {@link total} are checked. */
  checked: number;
}

/** The active list, plus the next few open items to tick off. */
export interface WidgetActiveList extends WidgetListSummary {
  /** The next open (unchecked) items in the order the app shows them. */
  open: WidgetItemView[];
}

/** One item due today or overdue, tagged with the list it belongs to. */
export interface WidgetDueItem {
  id: string;
  listId: string;
  listName: string;
  title: string;
  /** The resolved due day (`YYYY-MM-DD`) — the next occurrence for a recurring item. */
  deadline: string;
  /** `overdue` or `due-soon`; the widget warms its accent accordingly. */
  status: "overdue" | "due-soon";
}

/** The whole snapshot the native side stores and every widget reads. */
export interface WidgetSnapshot {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  /** When the snapshot was built (ISO-8601) — shown as the widget's freshness. */
  updatedAt: string;
  /** The active list projection, or null when the document has no active list. */
  active: WidgetActiveList | null;
  /** Every non-archived list, for the configurable list-picker widget. */
  lists: WidgetListSummary[];
  /** Items due today or overdue across all lists, soonest (most overdue) first. */
  due: WidgetDueItem[];
}

/** Options for {@link buildWidgetSnapshot}. */
export interface WidgetSnapshotOptions {
  /** The id of the list the app currently shows; falls back to the first active list. */
  activeListId?: string;
  /** The "now" instant (ISO-8601) — decides what counts as due today / overdue. */
  now: string;
  /** How many open items the active projection carries (default {@link DEFAULT_WIDGET_ITEM_LIMIT}). */
  itemLimit?: number;
  /** Whether the user sinks checked items — matches the app's display order. */
  sinkChecked?: boolean;
}

/**
 * The due day a widget should show for an item: a one-off item's own
 * `deadline`, or — for a recurring item whose anchor date has already
 * passed — its next real occurrence, so a long-missed recurring task reads as
 * due today rather than frozen weeks in the past.
 */
export function resolvedDeadline(
  item: {
    deadline?: string;
    recurrence?: { unit: "week" | "month" | "year"; interval: number };
  },
  now: string,
): string | undefined {
  if (!item.deadline) return undefined;
  if (!item.recurrence) return item.deadline;
  // A recurring item that is not yet overdue keeps its anchor date; once the
  // anchor has passed, surface the next occurrence strictly after today.
  if (deadlineStatus(item.deadline, now) === "overdue") {
    return nextOccurrence(item.deadline, item.recurrence, now);
  }
  return item.deadline;
}

/** Reduce a checklist to its picker/ring summary. */
function summarize(list: Checklist): WidgetListSummary {
  const { checked, total } = progress(list);
  const summary: WidgetListSummary = {
    id: list.id,
    name: list.name,
    total,
    checked,
  };
  if (list.glyph) summary.glyph = list.glyph;
  if (list.color) summary.color = list.color;
  return summary;
}

/**
 * Build the compact widget snapshot from the full document. Skips archived
 * lists entirely; within a list, counts and open items span the visible
 * (non-archived) tree, sub-items included, in the same order the app renders.
 */
export function buildWidgetSnapshot(
  doc: Snapshot,
  options: WidgetSnapshotOptions,
): WidgetSnapshot {
  const { now, activeListId } = options;
  const itemLimit = options.itemLimit ?? DEFAULT_WIDGET_ITEM_LIMIT;

  const visibleLists = doc.checklists.filter((c) => !c.archived);

  const active =
    visibleLists.find((c) => c.id === activeListId) ?? visibleLists[0] ?? null;

  const activeProjection: WidgetActiveList | null = active
    ? {
        ...summarize(active),
        open: flattenItems(displayItems(active, options.sinkChecked ?? false))
          .filter((it) => !it.checked)
          .slice(0, itemLimit)
          .map((it) => {
            const view: WidgetItemView = { id: it.id, title: it.title };
            const due = resolvedDeadline(it, now);
            if (due) view.deadline = due;
            return view;
          }),
      }
    : null;

  // Due today or overdue across every visible list. A checked item is done —
  // even if its date has passed — so only unchecked items count.
  const due: WidgetDueItem[] = [];
  for (const list of visibleLists) {
    for (const it of flattenItems(activeItems(list))) {
      if (it.checked || !it.deadline) continue;
      const deadline = resolvedDeadline(it, now)!;
      const status = deadlineStatus(deadline, now);
      if (status !== "overdue" && status !== "due-soon") continue;
      // "due-soon" is today or tomorrow; the widget only wants today + overdue.
      if (status === "due-soon" && deadline > now.slice(0, 10)) continue;
      due.push({
        id: it.id,
        listId: list.id,
        listName: list.name,
        title: it.title,
        deadline,
        status,
      });
    }
  }
  // Most overdue first, then today; ties keep document order (stable sort).
  due.sort((a, b) => a.deadline.localeCompare(b.deadline));

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    updatedAt: now,
    active: activeProjection,
    lists: visibleLists.map(summarize),
    due,
  };
}

/**
 * An action a widget recorded for the app to apply. The interactive check-off
 * widget can't write the WebView's store from its own process, so its App
 * Intent queues one of these in the shared container; the app drains the queue
 * and applies each through the normal edit path (so the write goes through the
 * same save / conflict handling every other edit does — never a second path).
 * Only `toggle` exists today; the tagged shape leaves room for more.
 */
export type WidgetAction = {
  type: "toggle";
  /** The list the item lives in. */
  listId: string;
  /** The item to toggle. */
  itemId: string;
};

/**
 * Narrow an untrusted value (parsed from the shared container, so it crossed a
 * process boundary) to a {@link WidgetAction}. Returns null for anything that
 * isn't a well-formed action so a corrupt queue entry is dropped, not applied.
 */
export function parseWidgetAction(value: unknown): WidgetAction | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    v.type === "toggle" &&
    typeof v.listId === "string" &&
    typeof v.itemId === "string"
  ) {
    return { type: "toggle", listId: v.listId, itemId: v.itemId };
  }
  return null;
}

/**
 * Apply a widget action to the document, returning the updated snapshot. A
 * toggle targets an item in a named list — resolved by id so it lands in the
 * right list even when it isn't the active one — and is a no-op (same
 * document, no `updatedAt` bump) when the list or item no longer exists, so a
 * stale action queued against a since-deleted item can't corrupt anything.
 */
export function applyWidgetAction(
  doc: Snapshot,
  action: WidgetAction,
  now: string,
): Snapshot {
  const list = doc.checklists.find((c) => c.id === action.listId);
  if (!list || !findItem(list.items, action.itemId)) return doc;
  const updated = toggleItem(list, action.itemId, now);
  if (updated === list) return doc;
  return {
    ...doc,
    checklists: doc.checklists.map((c) => (c.id === list.id ? updated : c)),
  };
}
