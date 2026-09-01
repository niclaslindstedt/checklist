// Core data model for checklist. These types are plain JSON and carry no
// behavior; the functions in this folder operate over them. Nothing here may
// import from ui/, storage/, the DOM, or fetch (see AGENTS.md).

/** A single checkable line in a template or checklist. */
export interface Item {
  id: string;
  title: string;
  notes?: string;
  required?: boolean;
}

/** The unit a recurring deadline repeats on. */
export type RecurrenceUnit = "week" | "month" | "year";

/**
 * How a dated item repeats. `interval` is a whole number of `unit`s (>= 1) —
 * "every 2 weeks" is `{ unit: "week", interval: 2 }`. Only meaningful
 * alongside a `deadline`, which anchors the schedule: checking a recurring
 * item rolls its `deadline` forward one interval (see `toggleItem`) instead
 * of ticking it off, so the task reappears on its next due date.
 */
export interface Recurrence {
  unit: RecurrenceUnit;
  interval: number;
}

/**
 * What a template and a checklist have in common: a named, styled tree of
 * items with timestamps. Both sides of the template ↔ checklist round trip
 * carry the *same* item model (`ChecklistItem`), so a template captures
 * everything a list can express — sub-items, categories, notes, required
 * flags, deadlines — and stamping one out reproduces the list faithfully.
 *
 * The item operations in `item-ops.ts`, `archive-ops.ts`, and
 * `item-display.ts` are generic over this base (`<L extends ItemList>`), so a
 * template is edited by exactly the same verbs as a checklist rather than a
 * parallel, drifting set.
 */
export interface ItemList {
  /** Reserved for future migrations; there is only one version today. */
  version: 1;
  id: string;
  name: string;
  items: ChecklistItem[];
  /**
   * Optional icon, by name in the shared glyph set (see `src/ui/glyphs.ts`).
   * Typed as a bare `string` so this pure module stays free of any `ui/`
   * dependency; the UI validates it against the known glyph set on the way in.
   * Absent (rather than `null`) when unstyled, so an older document needs no
   * migration.
   */
  glyph?: string;
  /** Optional accent colour (a CSS colour string) tinting the glyph. */
  color?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A reusable, named list of items. Identified by a stable UUIDv7 `id`.
 *
 * A template mirrors a `Checklist` exactly, minus the fields that only make
 * sense for a live instance (`templateId`, `archived`, `folderId`): its items
 * are full `ChecklistItem`s so nesting, categories, notes, required flags, and
 * deadlines all survive extraction. Every item in a stored template is
 * **unchecked** — `extractTemplate` clears the checked state on the way in and
 * the template view renders the boxes inert — so `checked` is carried only
 * because the item model is shared, never as meaningful state.
 */
export type Template = ItemList;

/** A checked item within a checklist instance. */
export interface ChecklistItem extends Item {
  checked: boolean;
  /**
   * Archived items stay in the document but drop out of the active view.
   * Swiping an item right marks it archived so it disappears without being
   * destroyed; the archive view (reached from the side menu) lists them and
   * can restore or delete each one. Absent means active.
   */
  archived?: boolean;
  /**
   * When the item was last checked off (ISO-8601). Stamped by `toggleItem`
   * on the false→true flip and cleared when it's unchecked, so it only
   * exists while `checked` is true. Drives the "sort checked to the bottom"
   * view order — the most recently checked item heads the checked group —
   * without ever reordering the stored document. Absent for items checked
   * before this field existed (they sink last among the checked ones).
   */
  checkedAt?: string;
  /**
   * Nested sub-items. An item becomes a child of another by dropping it onto
   * that item while dragging (see `moveItemInto`). A parent's checked state
   * cascades to its whole subtree — checking a parent checks every
   * descendant, unchecking unchecks them (see `toggleItem`). The "sort
   * checked to the bottom" order applies within each sub-list independently.
   * Absent (rather than an empty array) when an item has no children, so a
   * leaf round-trips byte-for-byte.
   */
  children?: ChecklistItem[];
  /**
   * An optional due date (a plain `YYYY-MM-DD` calendar day, no time zone).
   * Set from the clock affordance on a swiped-open row. A dated item floats
   * to the bottom of the unchecked items (see `displayItems`) and shows a
   * colour-coded "date row" above it that warms from muted → yellow → orange
   * → red as the day approaches and passes (see `deadlineStatus`). Absent
   * (rather than `null`) when undated, so an older document needs no
   * migration.
   */
  deadline?: string;
  /**
   * An optional **not before** day (a plain `YYYY-MM-DD` calendar day, no time
   * zone) — the earliest day the item may be checked off. Set from the same
   * timing modal as {@link deadline}, and independent of it: an item may carry
   * either, both, or neither. While the day is still in the future the item is
   * *held back* — its checkbox is inert (see `isHeldBack`) and a colourless
   * date row states when it opens up. The moment the day arrives the hold
   * lifts and the row disappears, leaving an ordinary item behind, so the
   * field is a gate rather than a badge. Absent (rather than `null`) when
   * ungated, so an older document needs no migration.
   */
  notBefore?: string;
  /**
   * How this item's {@link deadline} repeats, if at all. Only carried
   * alongside a `deadline` (recurrence needs an anchor date); checking a
   * recurring item advances its `deadline` by one interval and leaves it
   * unchecked rather than ticking it off. Absent on a one-off dated item.
   */
  recurrence?: Recurrence;
  /**
   * When true, this item is a **category** — a header the user promoted from
   * an ordinary item (via the row's long-press / right-click menu, offered
   * only on an item that has sub-items). A category groups the items nested
   * under it — store names in a shopping list, say — and behaves like a
   * pinned heading: the bulk "archive finished" and "delete finished" sweeps
   * skip it even when it is checked, so it stays put to be refilled while its
   * finished children are cleared out from underneath it. It still renders
   * slimmer and lighter than a real item, and stays individually
   * renamable / removable / archivable — only the two bulk sweeps and the
   * styling treat it specially. Absent (rather than `false`) on a normal
   * item, so an older document needs no migration.
   */
  category?: boolean;
}

/**
 * An instance stamped out from a template at a point in time. Ad-hoc lists
 * created straight from the checklist view (not from any template) carry an
 * empty `templateId`.
 */
export interface Checklist extends ItemList {
  /**
   * The template this list was stamped out of, by `Template.id` — empty for
   * an ad-hoc list created straight from the checklist view. A backward link
   * only: the instance is fully independent, so later edits to either side
   * never propagate across it.
   */
  templateId: string;
  /**
   * An archived checklist drops out of the sidebar switcher and the
   * checklist view, surfacing instead under the archive view's "Archived
   * lists" section, where it can be restored or deleted as a whole. Absent
   * means active. Mirrors `archived` on a `ChecklistItem`, but for the
   * whole list — right-click a list (desktop) and choose Archive.
   */
  archived?: boolean;
  /**
   * The folder this checklist sits in within the namespace, by `Folder.id`.
   * A checklist with no `folderId` lives at the top level (ungrouped).
   * Folders group checklists *inside* a namespace; the registry of folders
   * rides on the `Snapshot`. Absent on an ungrouped list rather than written
   * as `null`, so an older document needs no migration. On the file/cloud
   * backends it rides the markdown frontmatter (`folder: <id>`) so the
   * grouping survives a round-trip — and that frontmatter link is the
   * authoritative one: a list's physical directory is only a browsable
   * projection of it.
   */
  folderId?: string;
  /**
   * When this list resets itself on a schedule — unchecking every active item
   * at the chosen time of day, every N days / weeks / months or on chosen
   * weekdays — so a recurring routine (leaving the house, closing up shop)
   * starts fresh each time without the user clearing it by hand. Set from the
   * clock button on the list's sidebar row. Absent (rather than `null`) on an
   * unscheduled list, so an older document needs no migration.
   */
  resetSchedule?: ResetSchedule;
  /**
   * The scheduled occurrence most recently applied to this list (ISO-8601) —
   * the instant the reset was *due*, not when the app got round to it. The
   * next reset is the first occurrence after it; a list whose schedule has
   * never fired has none and counts from the schedule's `since` instead.
   */
  lastResetAt?: string;
}

/**
 * The cadence a checklist's scheduled reset repeats on. `day` / `week` /
 * `month` fire every `interval` of that unit, anchored on the day the schedule
 * was set; `dayOfWeek` fires on each weekday listed in `daysOfWeek` and ignores
 * `interval`.
 */
export type ResetScheduleUnit = "day" | "week" | "month" | "dayOfWeek";

/**
 * When a checklist resets itself — unchecking every active item so it reads
 * fresh again — the way a "before leaving home" list wants to start over every
 * morning. Evaluated in the device's local time: `hour` / `minute` are the
 * wall-clock time of day the reset falls due, and `since` (an ISO-8601 instant,
 * stamped when the schedule is saved) anchors the cadence so "every 2 weeks"
 * counts from the week the schedule was set. A missed occurrence (the app was
 * closed) is applied on the next open, once — see `dueResetAt`.
 */
export interface ResetSchedule {
  unit: ResetScheduleUnit;
  /** Whole number of `unit`s between resets (>= 1). Ignored for `dayOfWeek`. */
  interval: number;
  /** For `dayOfWeek`: the weekdays to reset on, `0` = Sunday … `6` = Saturday. */
  daysOfWeek?: number[];
  /** Local hour of day the reset falls due (0–23). */
  hour: number;
  /** Local minute of the hour the reset falls due (0–59). */
  minute: number;
  /**
   * When true, a list that has just been reset opens in a pop-up over
   * whatever list is on screen the next time the app is opened, so the
   * fresh list is in front of the user without a trip through the sidebar.
   */
  popUp: boolean;
  /** When the schedule was set (ISO-8601) — the anchor the cadence counts from. */
  since: string;
}

/**
 * A schedule as the schedule modal commits it — everything but the `since`
 * anchor, which the verb stamps with the current instant on save.
 */
export type ResetSchedulePatch = Omit<ResetSchedule, "since">;

/**
 * A complete replacement for an item's timing, as the timing modal commits it:
 * the earliest day it may be checked off, its due date, and how that due date
 * repeats. Every field is absolute rather than a patch — `null` clears — so
 * one save can set one date and drop another. `notBefore` and `deadline` are
 * independent; `recurrence` only survives alongside a `deadline`, which
 * anchors it (see `setItemTiming`).
 */
export interface TimingPatch {
  notBefore: string | null;
  deadline: string | null;
  recurrence: Recurrence | null;
}

/**
 * A partial appearance change for a checklist — set a field to a value, or
 * `null` to clear it back to the default. Mirrors the namespace appearance
 * patch shape, kept here in `domain/` so the pure layer owns the type rather
 * than importing it from `storage/`.
 */
export interface ChecklistAppearance {
  glyph?: string | null;
  color?: string | null;
}

/**
 * A folder: a named bucket grouping checklists *within* a single namespace.
 * The `id` is stable (a checklist points at it by `folderId`); the `name` is
 * an editable label. A folder can be empty — it exists in the `Snapshot`'s
 * folder registry independently of whether any checklist references it — so a
 * freshly-created, still-unfilled folder persists. Pure data, like the rest
 * of this module.
 */
export interface Folder {
  id: string;
  name: string;
  /**
   * When the folder was created (ISO-8601), set once. Folders sort by
   * creation order so the list stays stable as checklists move in and out.
   */
  createdAt: string;
}

/** The full document persisted by a storage backend. */
export interface Snapshot {
  templates: Template[];
  checklists: Checklist[];
  /**
   * The folders defined in this namespace, by which checklists are grouped
   * (a checklist points at one by `Checklist.folderId`). Kept on the
   * snapshot — not derived from the checklists — so an empty folder persists.
   * Absent rather than an empty array when no folders exist, so an older
   * document needs no migration.
   */
  folders?: Folder[];
}

export function emptySnapshot(): Snapshot {
  return { templates: [], checklists: [] };
}
