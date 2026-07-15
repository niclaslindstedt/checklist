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

import { activeItems, archivedItems } from "../../domain/checklists.ts";
import type {
  Checklist,
  ChecklistItem,
  Folder,
  Item,
  Recurrence,
  RecurrenceUnit,
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

// Trailing marker that carries an item's due date and (optionally) how it
// repeats, e.g. `*(due 2026-07-20)*` or `*(due 2026-07-20, every 2 weeks)*`.
// Rendered as an italic aside by every markdown viewer — human-readable and
// round-trippable, in the same spirit as REQUIRED_MARKER. Recurrence emits a
// bare `every <unit>` for an interval of one and `every <n> <unit>s` above.
const DUE_MARKER_RE =
  /\s*\*\(due (\d{4}-\d{2}-\d{2})(?:, every (?:(\d+) )?(week|month|year)s?)?\)\*/;

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
  return renderFrontmatter(front) + "\n" + checklistBodyMarkdown(checklist);
}

/**
 * The body of a checklist as standalone markdown — the `# Name` heading,
 * the active `- [ ] / - [x]` items, then a `## Archived` section if any —
 * without the persistence frontmatter. This is what the in-app "copy"
 * affordance puts on the clipboard: human-readable task-list markdown a
 * user can paste anywhere (and back into the app, see
 * `parseItemsFromMarkdown`), where checked items stay checked.
 *
 * `includeArchived` controls whether the `## Archived` section is emitted.
 * It defaults to `true` so the on-disk markdown file keeps every archived
 * item (the archive is the live store, not an export). The copy affordance
 * passes the user's "Include archived in copy" setting, which defaults to
 * off — so a copied list is just its active items unless the user opts in.
 */
export function checklistBodyMarkdown(
  checklist: Checklist,
  includeArchived = true,
): string {
  // `activeItems` / `archivedItems` walk the item tree, so nested sub-items
  // render indented under their parent and an archived subtree lands whole in
  // the Archived section.
  const active = activeItems(checklist);
  const archived = includeArchived ? archivedItems(checklist) : [];

  const lines: string[] = [`# ${checklist.name}`, ""];
  for (const item of active) lines.push(...renderChecklistItem(item, 0));
  if (archived.length > 0) {
    lines.push("", "## Archived", "");
    for (const item of archived) lines.push(...renderChecklistItem(item, 0));
  }
  return lines.join("\n").replace(/\n*$/, "") + "\n";
}

export function templateToMarkdown(template: Template): string {
  const front: Record<string, string> = {
    type: "template",
    id: template.id,
    created: template.createdAt,
    updated: template.updatedAt,
  };
  const lines: string[] = [renderFrontmatter(front), `# ${template.name}`, ""];
  for (const item of template.items) lines.push(...renderTemplateItem(item));
  return lines.join("\n").replace(/\n*$/, "") + "\n";
}

// Two spaces of indent per nesting level — the standard task-list nesting
// every markdown viewer understands.
function indentFor(depth: number): string {
  return "  ".repeat(depth);
}

function renderChecklistItem(item: ChecklistItem, depth: number): string[] {
  const pad = indentFor(depth);
  const box = item.checked ? "x" : " ";
  const lines = [
    `${pad}- [${box}] ${renderItemTitle(item)}${renderDueMarker(item)}`,
    ...renderNotes(item.notes, pad),
  ];
  for (const child of item.children ?? []) {
    lines.push(...renderChecklistItem(child, depth + 1));
  }
  return lines;
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

// Templates are flat (the `Item` model carries no children), so they render
// at a single level — only checklists nest.
function renderTemplateItem(item: Item): string[] {
  return [`- ${renderItemTitle(item)}`, ...renderNotes(item.notes, "")];
}

function renderItemTitle(item: Item): string {
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
    return {
      kind: "template",
      template: {
        version: 1,
        id,
        name: heading,
        items: flattenRaw(items).map((raw, i) => toItem(raw, `${id}-${i}`)),
        createdAt: created,
        updatedAt: updated,
      },
    };
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
  /** A due date (`YYYY-MM-DD`) recovered from a `*(due …)*` marker. */
  deadline?: string;
  /** How the deadline repeats, recovered alongside it. Only with a deadline. */
  recurrence?: Recurrence;
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
    if (raw.deadline) item.deadline = raw.deadline;
    if (raw.deadline && raw.recurrence) item.recurrence = raw.recurrence;
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
  deadline?: string;
  recurrence?: Recurrence;
  children?: RawItem[];
};

// Templates are flat, so a nested template body collapses to a single level.
function flattenRaw(items: readonly RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  for (const raw of items) {
    out.push(raw);
    if (raw.children) out.push(...flattenRaw(raw.children));
  }
  return out;
}

function toItem(raw: RawItem, id: string): Item {
  const item: Item = { id, title: raw.title };
  if (raw.notes) item.notes = raw.notes;
  if (raw.required) item.required = true;
  return item;
}

function toChecklistItem(raw: RawItem, id: string): ChecklistItem {
  const item: ChecklistItem = { id, title: raw.title, checked: raw.checked };
  if (raw.notes) item.notes = raw.notes;
  if (raw.required) item.required = true;
  if (raw.archived) item.archived = true;
  if (raw.deadline) item.deadline = raw.deadline;
  if (raw.deadline && raw.recurrence) item.recurrence = raw.recurrence;
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
// (templates), at any indentation. Returns the item plus its leading-space
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
      ...(meta.deadline ? { deadline: meta.deadline } : {}),
      ...(meta.deadline && meta.recurrence
        ? { recurrence: meta.recurrence }
        : {}),
    },
  };
}

// Peel the trailing `*(required)*` / `*(due …)*` markers off an item's text,
// returning the clean title plus whatever the markers carried. The due marker
// may sit anywhere in the string (it's spliced out in place), and required is
// stripped last from the tail — mirroring how they render (required first,
// then due).
function parseItemMeta(raw: string): {
  title: string;
  required: boolean;
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
  const { title, required } = stripRequired(text);
  return { title, required, deadline, recurrence };
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
