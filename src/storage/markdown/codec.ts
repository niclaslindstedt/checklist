// Markdown codec: turns a domain `Snapshot` into a set of individual
// markdown files (one per checklist, one per template) and back. This is
// what makes the file-based backends (local folder, Dropbox, Google
// Drive) store human-readable, tool-interoperable `.md` files instead of
// one opaque JSON blob — open a checklist in any editor, render it on
// GitHub, or commit it to git and the standard `- [ ]` / `- [x]` task
// syntax just works.
//
// The codec is pure (no DOM, no I/O) and lives in `storage/` rather than
// `domain/` because the on-disk *representation* is a persistence
// concern; `domain/` keeps working with the version-free `Snapshot`.
//
// Round-trip note: item ids are not stored in the markdown (they would
// only clutter the body for other tools, and nothing outside the app
// consumes them). They are regenerated deterministically on parse as
// `<parentId>-<index>` so a load with no intervening edit is idempotent —
// the same bytes always reconstruct the same `Snapshot`.

import {
  activeItems,
  archivedItems,
  findItem,
} from "../../domain/checklists.ts";
import type {
  Checklist,
  ChecklistItem,
  Folder,
  ItemList,
  Recurrence,
  RecurrenceUnit,
  ResetSchedule,
  Snapshot,
  Template,
} from "../../domain/types.ts";

/** A single markdown document keyed by its path relative to the namespace root. */
export type MarkdownFile = {
  /** e.g. `checklists/groceries-1a2b3c.md` or `templates/trip-9f8e7d.md`. */
  path: string;
  /** The full file contents, including frontmatter and a trailing newline. */
  text: string;
};

export const CHECKLISTS_DIR = "checklists";
export const TEMPLATES_DIR = "templates";

// Trailing marker that flags a required item. Rendered as italic
// "(required)" by every markdown viewer, so it reads as a meaningful cue
// to a human while still round-tripping the `required` flag.
const REQUIRED_MARKER = "*(required)*";

// Trailing marker that flags a category header (an item the user promoted to
// group the sub-items under it). Rendered as an italic aside by every markdown
// viewer, round-tripping the `category` flag in the same spirit as
// REQUIRED_MARKER so a categorised list survives on the file/cloud backends.
// Persistence-only: the copy affordance renders without it (see
// `ChecklistBodyOptions.categoryMarkers`).
const CATEGORY_MARKER = "*(category)*";

// Trailing marker that carries an item's due date and (optionally) how it
// repeats, e.g. `*(due 2026-07-20)*` or `*(due 2026-07-20, every 2 weeks)*`.
// Rendered as an italic aside by every markdown viewer — human-readable and
// round-trippable, in the same spirit as REQUIRED_MARKER. Recurrence emits a
// bare `every <unit>` for an interval of one and `every <n> <unit>s` above.
const DUE_MARKER_RE =
  /\s*\*\(due (\d{4}-\d{2}-\d{2})(?:, every (?:(\d+) )?(week|month|year)s?)?\)\*/;

// Trailing marker carrying an item's `not before` gate — the earliest day it
// may be checked off — e.g. `*(not before 2026-07-20)*`. Written and read
// independently of the due marker, since the two dates are independent.
const NOT_BEFORE_MARKER_RE = /\s*\*\(not before (\d{4}-\d{2}-\d{2})\)\*/;

// -- Filenames --------------------------------------------------------

/**
 * Folder-/tool-friendly file stem for an entry: a slug of its display
 * name, suffixed with a short slice of its id so two lists that share a
 * name never collide and the stem is deterministic from (name, id). A
 * rename changes the stem, so the old file is reconciled away on the next
 * save (see the directory adapter).
 */
export function entryFileStem(name: string, id: string): string {
  const base = slugify(name) || "list";
  return `${base}-${idSuffix(id)}`;
}

function idSuffix(id: string): string {
  const compact = id.replace(/[^a-z0-9]/gi, "");
  return (compact.slice(-6) || compact || "id").toLowerCase();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// -- Physical folder directories --------------------------------------
//
// A checklist's folder is a **real subdirectory** under the namespace's
// `checklists/` root on the file/cloud backends: a grouped list's `.md` is
// written into `checklists/<folder-dir>/<stem>.md`, so the synced folder is
// browsable and tool-friendly (open the `Groceries/` folder in any file
// manager and there are the lists). The directory name is a slug of the
// folder's display name, falling back to a stable id-derived stem for a name
// that slugs to nothing (an all-emoji name), so every folder still maps to a
// distinct, deterministic directory. The list's `folder:` frontmatter (the
// folder *id*) stays the authoritative link the load reads back — the
// directory is a write-side projection for browsing — so two folders that
// happen to slug alike never lose a list, and the folder's display name lives
// in the `folders.json` registry the directory adapter keeps (renaming a
// folder never has to rewrite every list file).

/** The directory segment a folder's checklists are filed under (no slashes). */
export function folderDirSegment(folder: Folder): string {
  return slugify(folder.name) || `folder-${idSuffix(folder.id)}`;
}

/**
 * The directory a checklist is filed under, relative to the `checklists/`
 * root: the empty string for an ungrouped list (it lives directly at the
 * root) and the folder's `folderDirSegment` when it points at a known folder.
 * An unknown / missing folder id (no registry, or a stale link) falls back to
 * the root.
 */
export function folderDirName(
  folderId: string | undefined,
  folders: readonly Folder[] | undefined,
): string {
  if (!folderId || !folders) return "";
  const folder = folders.find((f) => f.id === folderId);
  return folder ? folderDirSegment(folder) : "";
}

/**
 * The path a checklist's `.md` file lives at, relative to the namespace root,
 * resolving its folder against the registry:
 * `checklists/<folder-dir>/<stem>.md` when grouped, `checklists/<stem>.md`
 * when ungrouped.
 */
export function checklistFilePath(
  checklist: Checklist,
  folders?: readonly Folder[],
): string {
  const dir = folderDirName(checklist.folderId, folders);
  const stem = entryFileStem(checklist.name, checklist.id);
  return dir
    ? `${CHECKLISTS_DIR}/${dir}/${stem}.md`
    : `${CHECKLISTS_DIR}/${stem}.md`;
}

// -- Serialize --------------------------------------------------------

/** Every checklist and template in a snapshot, as individual markdown files. */
export function snapshotToFiles(snapshot: Snapshot): MarkdownFile[] {
  const files: MarkdownFile[] = [];
  for (const template of snapshot.templates) {
    files.push({
      path: `${TEMPLATES_DIR}/${entryFileStem(template.name, template.id)}.md`,
      text: templateToMarkdown(template),
    });
  }
  for (const checklist of snapshot.checklists) {
    // A grouped list is filed into its folder's real subdirectory; an
    // ungrouped one sits at the `checklists/` root.
    files.push({
      path: checklistFilePath(checklist, snapshot.folders),
      text: checklistToMarkdown(checklist),
    });
  }
  return files;
}

export function checklistToMarkdown(checklist: Checklist): string {
  const front: Record<string, string> = {
    type: "checklist",
    id: checklist.id,
    created: checklist.createdAt,
    updated: checklist.updatedAt,
  };
  if (checklist.templateId) front.template = checklist.templateId;
  // The folder the list belongs to, by id. Only written when set, so an
  // ungrouped list's frontmatter stays minimal and an older file (no link)
  // round-trips as ungrouped. The folder's display name lives in the
  // `folders.json` sidecar, so this is just the authoritative link.
  if (checklist.folderId) front.folder = checklist.folderId;
  // The list's chosen appearance (icon name and/or accent colour). Only
  // written when set, so an unstyled list's frontmatter stays minimal and an
  // older file round-trips with no appearance.
  if (checklist.glyph) front.glyph = checklist.glyph;
  if (checklist.color) front.color = checklist.color;
  // The scheduled reset, as a readable phrase (`every 2 days at 08:00`) plus
  // the two instants that anchor it. Only written when scheduled, so an
  // unscheduled list's frontmatter stays minimal.
  if (checklist.resetSchedule) {
    front.reset = renderResetSchedule(checklist.resetSchedule);
    front["reset-since"] = checklist.resetSchedule.since;
    if (checklist.lastResetAt) front["reset-last"] = checklist.lastResetAt;
  }
  return renderFrontmatter(front) + "\n" + checklistBodyMarkdown(checklist);
}

// -- Reset schedule frontmatter ----------------------------------------
//
// A schedule is written as one human-readable `reset:` line — `every day at
// 08:00`, `every 2 weeks at 07:30, pop up`, `every mon,wed,fri at 08:00` — so
// the file still reads sensibly in any editor, with the cadence anchor
// (`reset-since:`) and the last applied occurrence (`reset-last:`) as plain
// ISO instants on their own lines. `since` is required to reconstruct a
// schedule; a file missing it drops the schedule rather than inventing an
// anchor.

const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const RESET_INTERVAL_RE =
  /^every (?:(\d+) )?(day|week|month)s? at (\d{1,2}):(\d{2})(, pop up)?$/;
const RESET_WEEKDAY_RE =
  /^every ((?:sun|mon|tue|wed|thu|fri|sat)(?:,(?:sun|mon|tue|wed|thu|fri|sat))*) at (\d{1,2}):(\d{2})(, pop up)?$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** The `reset:` phrase for a schedule (without its anchor instants). */
export function renderResetSchedule(schedule: ResetSchedule): string {
  const time = `${pad2(schedule.hour)}:${pad2(schedule.minute)}`;
  const popUp = schedule.popUp ? ", pop up" : "";
  if (schedule.unit === "dayOfWeek") {
    const days = [...(schedule.daysOfWeek ?? [])]
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_NAMES[d])
      .join(",");
    return `every ${days} at ${time}${popUp}`;
  }
  const cadence =
    schedule.interval === 1
      ? schedule.unit
      : `${schedule.interval} ${schedule.unit}s`;
  return `every ${cadence} at ${time}${popUp}`;
}

/**
 * Parse a `reset:` phrase back into a schedule, given its `since` anchor.
 * Returns null for anything unrecognised so a hand-edited line can't yield a
 * schedule that fires at some surprising time.
 */
export function parseResetSchedule(
  phrase: string,
  since: string,
): ResetSchedule | null {
  const text = phrase.trim();
  const interval = RESET_INTERVAL_RE.exec(text);
  if (interval) {
    const hour = Number(interval[3]);
    const minute = Number(interval[4]);
    if (hour > 23 || minute > 59) return null;
    return {
      unit: interval[2] as "day" | "week" | "month",
      interval: interval[1] ? Math.max(1, Number(interval[1])) : 1,
      hour,
      minute,
      popUp: Boolean(interval[5]),
      since,
    };
  }
  const weekday = RESET_WEEKDAY_RE.exec(text);
  if (weekday) {
    const hour = Number(weekday[2]);
    const minute = Number(weekday[3]);
    if (hour > 23 || minute > 59) return null;
    const days = [
      ...new Set(weekday[1]!.split(",").map((n) => WEEKDAY_NAMES.indexOf(n))),
    ].sort((a, b) => a - b);
    return {
      unit: "dayOfWeek",
      interval: 1,
      daysOfWeek: days,
      hour,
      minute,
      popUp: Boolean(weekday[4]),
      since,
    };
  }
  return null;
}

/** How `checklistBodyMarkdown` renders a list. Every field is optional. */
export interface ChecklistBodyOptions {
  /**
   * Emit the `## Archived` section. Defaults to `true` so the on-disk
   * markdown file keeps every archived item (the archive is the live store,
   * not an export). The copy affordance passes the user's "Include archived
   * in copy" setting, which defaults to off — so a copied list is just its
   * active items unless the user opts in.
   */
  includeArchived?: boolean;
  /**
   * Emit the trailing `*(category)*` marker on a category header. Defaults to
   * `true`, which is what makes a categorised list survive the round-trip
   * through the file/cloud backends. The copy affordance passes `false`: on
   * the clipboard the marker is noise, since a header with items nested under
   * it already reads as a category to a human.
   */
  categoryMarkers?: boolean;
  /**
   * Restrict the body to the items nested under one **category** header, by
   * item id. The header's own line is left out — just its children come
   * along, rendered at the top level as if they were the whole list. Omit for
   * the whole checklist. An id that names nothing (a stale menu selection)
   * yields a body with no items rather than silently falling back to the
   * whole list.
   */
  categoryId?: string;
}

/**
 * The body of a checklist (or a template) as standalone markdown — the `# Name` heading,
 * the active `- [ ] / - [x]` items, then a `## Archived` section if any —
 * without the persistence frontmatter. This is what the in-app "copy"
 * affordance puts on the clipboard: human-readable task-list markdown a
 * user can paste anywhere (and back into the app, see
 * `parseItemsFromMarkdown`), where checked items stay checked.
 *
 * See {@link ChecklistBodyOptions} for the knobs. The defaults are the
 * persistence shape (the whole list, archive and category markers included);
 * the copy path is the caller that opts out.
 */
export function checklistBodyMarkdown(
  checklist: ItemList,
  options: ChecklistBodyOptions = {},
): string {
  const {
    includeArchived = true,
    categoryMarkers = true,
    categoryId,
  } = options;
  // Scoping to a category is expressed as a checklist whose items *are* that
  // category's children, so the active / archived split below is the same
  // walk either way.
  const scope = categoryId ? scopeToCategory(checklist, categoryId) : checklist;
  // `activeItems` / `archivedItems` walk the item tree, so nested sub-items
  // render indented under their parent and an archived subtree lands whole in
  // the Archived section.
  const active = activeItems(scope);
  const archived = includeArchived ? archivedItems(scope) : [];

  const lines: string[] = [`# ${checklist.name}`, ""];
  for (const item of active) {
    lines.push(...renderChecklistItem(item, 0, categoryMarkers));
  }
  if (archived.length > 0) {
    lines.push("", "## Archived", "");
    for (const item of archived) {
      lines.push(...renderChecklistItem(item, 0, categoryMarkers));
    }
  }
  return lines.join("\n").replace(/\n*$/, "") + "\n";
}

/** The list reduced to one category's children (empty if unknown). */
function scopeToCategory(checklist: ItemList, categoryId: string): ItemList {
  const category = findItem(checklist.items, categoryId);
  return { ...checklist, items: category?.children ?? [] };
}

/**
 * A template as standalone markdown. Rendered exactly like a checklist — the
 * same nested `- [ ]` task lines with the same `*(required)*` /
 * `*(category)*` / `*(not before …)*` / `*(due …)*` markers — because a template carries the same
 * item model a checklist does. Every box is unchecked (a stored template holds
 * no checked state), and there is no `## Archived` section: extraction drops
 * archived items rather than capturing them.
 */
export function templateToMarkdown(template: Template): string {
  const front: Record<string, string> = {
    type: "template",
    id: template.id,
    created: template.createdAt,
    updated: template.updatedAt,
  };
  // The template's chosen appearance, which rides along into every list
  // stamped out of it. Only written when set, so an unstyled template's
  // frontmatter stays minimal and an older file round-trips with none.
  if (template.glyph) front.glyph = template.glyph;
  if (template.color) front.color = template.color;
  const lines: string[] = [renderFrontmatter(front), `# ${template.name}`, ""];
  for (const item of template.items) {
    // Markers on: this is the persistence shape, so a template's categories
    // must survive the round trip exactly as a checklist file's do.
    lines.push(...renderChecklistItem(item, 0, true));
  }
  return lines.join("\n").replace(/\n*$/, "") + "\n";
}

// Two spaces of indent per nesting level — the standard task-list nesting
// every markdown viewer understands.
function indentFor(depth: number): string {
  return "  ".repeat(depth);
}

function renderChecklistItem(
  item: ChecklistItem,
  depth: number,
  categoryMarkers: boolean,
): string[] {
  const pad = indentFor(depth);
  const box = item.checked ? "x" : " ";
  const marker = categoryMarkers ? renderCategoryMarker(item) : "";
  const lines = [
    `${pad}- [${box}] ${renderItemTitle(item)}${marker}${renderNotBeforeMarker(item)}${renderDueMarker(item)}`,
    ...renderNotes(item.notes, pad),
  ];
  for (const child of item.children ?? []) {
    lines.push(...renderChecklistItem(child, depth + 1, categoryMarkers));
  }
  return lines;
}

/** The ` *(category)*` suffix for a category header, or "" otherwise. */
function renderCategoryMarker(item: ChecklistItem): string {
  return item.category ? ` ${CATEGORY_MARKER}` : "";
}

/** The ` *(not before …)*` suffix for a gated item, or "" when it's ungated. */
function renderNotBeforeMarker(item: ChecklistItem): string {
  return item.notBefore ? ` *(not before ${item.notBefore})*` : "";
}

/** The ` *(due …)*` suffix for a dated item, or "" when it has no deadline. */
function renderDueMarker(item: ChecklistItem): string {
  if (!item.deadline) return "";
  const parts = [`due ${item.deadline}`];
  if (item.recurrence) parts.push(renderRecurrence(item.recurrence));
  return ` *(${parts.join(", ")})*`;
}

function renderRecurrence(recurrence: Recurrence): string {
  return recurrence.interval === 1
    ? `every ${recurrence.unit}`
    : `every ${recurrence.interval} ${recurrence.unit}s`;
}

function renderItemTitle(item: ChecklistItem): string {
  return item.required ? `${item.title} ${REQUIRED_MARKER}` : item.title;
}

function renderNotes(notes: string | undefined, pad: string): string[] {
  if (!notes) return [];
  // Indent each note line two spaces past the item's bullet so it renders as
  // a continuation of the list item rather than a sibling (or a nested item).
  return notes.split("\n").map((line) => `${pad}  ${line}`);
}

function renderFrontmatter(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${body}\n---\n`;
}

// -- Parse ------------------------------------------------------------

/**
 * Reconstruct a `Snapshot` from a set of markdown files. Files that fail
 * to parse (corrupt frontmatter, missing type) are skipped rather than
 * failing the whole load — a single bad file shouldn't hide every other
 * list. Order follows the input file order.
 */
export function filesToSnapshot(files: readonly MarkdownFile[]): Snapshot {
  const templates: Template[] = [];
  const checklists: Checklist[] = [];
  for (const file of files) {
    const parsed = parseEntry(file.text);
    if (parsed?.kind === "template") templates.push(parsed.template);
    else if (parsed?.kind === "checklist") checklists.push(parsed.checklist);
  }
  return { templates, checklists };
}

type ParsedEntry =
  | { kind: "template"; template: Template }
  | { kind: "checklist"; checklist: Checklist };

export function parseEntry(text: string): ParsedEntry | null {
  const { front, body } = splitFrontmatter(text);
  if (!front) return null;
  const id = front.id ?? "";
  if (!id) return null;
  const created = front.created ?? new Date(0).toISOString();
  const updated = front.updated ?? created;
  const { heading, items, archived } = parseBody(body);

  if (front.type === "template") {
    // A template parses through the very same item builder a checklist does,
    // so nesting, categories, notes, required flags, and deadlines all survive
    // the round trip. A pre-v2 file (flat `- title` bullets, no boxes) still
    // reads cleanly — `parseItemLine` accepts a plain bullet and reports it
    // unchecked, which is what every template item is anyway.
    const template: Template = {
      version: 1,
      id,
      name: heading,
      items: items.map((raw, i) => toChecklistItem(raw, `${id}-${i}`)),
      createdAt: created,
      updatedAt: updated,
    };
    if (front.glyph) template.glyph = front.glyph;
    if (front.color) template.color = front.color;
    return { kind: "template", template };
  }
  if (front.type === "checklist") {
    const all = [...items, ...archived.map((a) => ({ ...a, archived: true }))];
    const checklist: Checklist = {
      version: 1,
      id,
      templateId: front.template ?? "",
      name: heading,
      items: all.map((raw, i) => toChecklistItem(raw, `${id}-${i}`)),
      createdAt: created,
      updatedAt: updated,
    };
    // The authoritative folder link rides the frontmatter, not the file's
    // physical directory — carried only when present so an ungrouped list
    // round-trips minimally. The directory adapter reconciles the name from
    // the `folders.json` registry.
    if (front.folder) checklist.folderId = front.folder;
    // Per-list appearance, carried back only when present so an unstyled list
    // round-trips minimally.
    if (front.glyph) checklist.glyph = front.glyph;
    if (front.color) checklist.color = front.color;
    // The reset schedule needs both its phrase and its anchor; a file carrying
    // only one (or an unparseable phrase) round-trips as unscheduled.
    if (front.reset && front["reset-since"]) {
      const schedule = parseResetSchedule(front.reset, front["reset-since"]);
      if (schedule) {
        checklist.resetSchedule = schedule;
        if (front["reset-last"]) checklist.lastResetAt = front["reset-last"];
      }
    }
    return { kind: "checklist", checklist };
  }
  return null;
}

/** An item recovered from pasted markdown (see `parseItemsFromMarkdown`). */
export interface ImportedItem {
  title: string;
  checked: boolean;
  required: boolean;
  notes?: string;
  /**
   * The earliest day this item may be checked off (`YYYY-MM-DD`), recovered
   * from a `*(not before …)*` marker. Independent of `deadline`.
   */
  notBefore?: string;
  /** A due date (`YYYY-MM-DD`) recovered from a `*(due …)*` marker. */
  deadline?: string;
  /** How the deadline repeats, recovered alongside it. Only with a deadline. */
  recurrence?: Recurrence;
  /** True when a `*(category)*` marker flagged this as a category header. */
  category?: boolean;
  /** Nested sub-items, recovered from indented task lines. */
  children?: ImportedItem[];
}

/**
 * Parse pasted markdown into items, ignoring any frontmatter, headings,
 * and blank lines. Recognises GitHub task-list syntax (`- [ ]` / `- [x]`)
 * and plain bullets (`- ` / `* `); checked state and the `*(required)*`
 * marker round-trip, and two-space-indented continuation lines fold into
 * `notes`. Items under a `## Archived` heading are returned too — a paste
 * always lands as fresh items, so the section split is irrelevant here.
 *
 * Returns an empty array when the text holds no list lines, which is how a
 * caller tells an ordinary paste from a checklist paste worth importing.
 */
export function parseItemsFromMarkdown(text: string): ImportedItem[] {
  const { body } = splitFrontmatter(text);
  const { items, archived } = parseBody(body);
  const toImported = (raw: RawItem): ImportedItem => {
    const item: ImportedItem = {
      title: raw.title,
      checked: raw.checked,
      required: raw.required,
    };
    if (raw.notes) item.notes = raw.notes;
    if (raw.notBefore) item.notBefore = raw.notBefore;
    if (raw.deadline) item.deadline = raw.deadline;
    if (raw.deadline && raw.recurrence) item.recurrence = raw.recurrence;
    if (raw.category) item.category = true;
    if (raw.children && raw.children.length > 0) {
      item.children = raw.children.map(toImported);
    }
    return item;
  };
  return [...items, ...archived].map(toImported);
}

type RawItem = {
  title: string;
  checked: boolean;
  required: boolean;
  notes?: string;
  archived?: boolean;
  notBefore?: string;
  deadline?: string;
  recurrence?: Recurrence;
  category?: boolean;
  children?: RawItem[];
};

function toChecklistItem(raw: RawItem, id: string): ChecklistItem {
  const item: ChecklistItem = { id, title: raw.title, checked: raw.checked };
  if (raw.notes) item.notes = raw.notes;
  if (raw.required) item.required = true;
  if (raw.archived) item.archived = true;
  if (raw.notBefore) item.notBefore = raw.notBefore;
  if (raw.deadline) item.deadline = raw.deadline;
  if (raw.deadline && raw.recurrence) item.recurrence = raw.recurrence;
  if (raw.category) item.category = true;
  if (raw.children && raw.children.length > 0) {
    // Ids are regenerated deterministically from the path so a load with no
    // edit stays idempotent (see the round-trip note at the top of the file).
    item.children = raw.children.map((child, i) =>
      toChecklistItem(child, `${id}-${i}`),
    );
  }
  return item;
}

function splitFrontmatter(text: string): {
  front: Record<string, string> | null;
  body: string;
} {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!match) return { front: null, body: normalized };
  const front: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) front[key] = value;
  }
  return { front, body: normalized.slice(match[0].length) };
}

function parseBody(body: string): {
  heading: string;
  items: RawItem[];
  archived: RawItem[];
} {
  const lines = body.split("\n");
  let heading = "";
  const items: RawItem[] = [];
  const archived: RawItem[] = [];
  let bucket = items;
  // Open ancestors by indent, so each item nests under the nearest line
  // indented less than it — the standard task-list outline shape.
  let stack: { indent: number; item: RawItem }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!heading && /^#\s+/.test(line)) {
      heading = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (/^##\s+archived\s*$/i.test(line)) {
      bucket = archived;
      stack = [];
      continue;
    }
    const parsed = parseItemLine(line);
    if (!parsed) continue;
    const { indent, item } = parsed;

    // Gather continuation lines as notes — lines indented past this item's
    // bullet that are *not* themselves list items. A nested item ends the
    // gather (it belongs in the tree, not the note); a blank line that still
    // carries indentation is a paragraph break *within* a multi-paragraph
    // note and folds back in, while a fully empty line terminates it.
    const noteLines: string[] = [];
    while (i + 1 < lines.length) {
      const peek = lines[i + 1]!;
      if (parseItemLine(peek)) break;
      if (peek.trim() === "") {
        if (/^\s{2,}/.test(peek)) {
          noteLines.push("");
          i++;
          continue;
        }
        break;
      }
      if (leadingSpaces(peek) > indent) {
        noteLines.push(peek.replace(/^\s+/, ""));
        i++;
        continue;
      }
      break;
    }
    if (noteLines.length > 0) item.notes = noteLines.join("\n");

    // Splice the item into the tree by its indentation depth.
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
      stack.pop();
    }
    if (stack.length === 0) bucket.push(item);
    else {
      const parent = stack[stack.length - 1]!.item;
      (parent.children ??= []).push(item);
    }
    stack.push({ indent, item });
  }
  return { heading, items, archived };
}

function leadingSpaces(line: string): number {
  return /^[ \t]*/.exec(line)![0].length;
}

// A list item is `- [ ] title`, `- [x] title`, or a plain `- title`
// (pre-v2 template files), at any indentation. Returns the item plus its leading-space
// indent (which the tree builder turns into nesting depth), or null for any
// non-item line.
function parseItemLine(line: string): { indent: number; item: RawItem } | null {
  const m = /^([ \t]*)[-*]\s+(.*)$/.exec(line);
  if (!m) return null;
  const indent = m[1]!.length;
  const rest = m[2]!;
  const task = /^\[([ xX])\]\s+(.*)$/.exec(rest);
  const checked = task ? task[1]!.toLowerCase() === "x" : false;
  const body = task ? task[2]! : rest;
  const meta = parseItemMeta(body);
  return {
    indent,
    item: {
      title: meta.title,
      checked,
      required: meta.required,
      ...(meta.notBefore ? { notBefore: meta.notBefore } : {}),
      ...(meta.deadline ? { deadline: meta.deadline } : {}),
      ...(meta.deadline && meta.recurrence
        ? { recurrence: meta.recurrence }
        : {}),
      ...(meta.category ? { category: true } : {}),
    },
  };
}

// Peel the trailing `*(required)*` / `*(category)*` / `*(not before …)*` /
// `*(due …)*` markers off an item's text, returning the clean title plus
// whatever the markers carried. The two date markers may sit anywhere in the
// string (each is spliced out in place); the tail then reads
// `title *(required)* *(category)*` (the order they render), so category is
// peeled first and required last.
function parseItemMeta(raw: string): {
  title: string;
  required: boolean;
  category: boolean;
  notBefore?: string;
  deadline?: string;
  recurrence?: Recurrence;
} {
  let text = raw;
  let deadline: string | undefined;
  let recurrence: Recurrence | undefined;
  const due = DUE_MARKER_RE.exec(text);
  if (due) {
    deadline = due[1];
    if (due[3]) {
      recurrence = {
        unit: due[3] as RecurrenceUnit,
        interval: due[2] ? Number(due[2]) : 1,
      };
    }
    text = text.slice(0, due.index) + text.slice(due.index + due[0].length);
  }
  let notBefore: string | undefined;
  const gate = NOT_BEFORE_MARKER_RE.exec(text);
  if (gate) {
    notBefore = gate[1];
    text = text.slice(0, gate.index) + text.slice(gate.index + gate[0].length);
  }
  const { title: withoutCategory, category } = stripCategory(text);
  const { title, required } = stripRequired(withoutCategory);
  return { title, required, category, notBefore, deadline, recurrence };
}

function stripRequired(raw: string): { title: string; required: boolean } {
  const trimmed = raw.trim();
  if (trimmed.endsWith(REQUIRED_MARKER)) {
    return {
      title: trimmed.slice(0, -REQUIRED_MARKER.length).trim(),
      required: true,
    };
  }
  return { title: trimmed, required: false };
}

function stripCategory(raw: string): { title: string; category: boolean } {
  const trimmed = raw.trim();
  if (trimmed.endsWith(CATEGORY_MARKER)) {
    return {
      title: trimmed.slice(0, -CATEGORY_MARKER.length).trim(),
      category: true,
    };
  }
  return { title: trimmed, category: false };
}
