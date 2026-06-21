// Registry of namespaces, plus the path/key helpers that map a namespace
// onto a concrete storage location. A namespace is a named bucket holding
// its own checklist document: switching the active namespace swaps which
// document the app reads and writes.
//
// localStorage is the synchronous home the registry is read from (first
// paint and adapter construction need it before any network resolves), but
// on a file backend it is no longer the canonical store: the list of
// namespaces is mirrored to `namespaces.json` at the app-folder root (see
// `namespace-store.ts`) so it travels with the synced/shared folder.
// Connecting a backend on a new device reconciles the two — adopting the
// backend's namespaces and uploading this device's local-only ones (see
// `mergeNamespaceLists`) — so the namespace list follows the user across
// devices the way `settings.json` does. The *active* namespace pointer
// stays per-device: which list you're looking at is a local cursor, not
// shared state.
//
// Storage layout (the part that makes folder-sharing work):
//   - Cloud backends give every namespace its own folder so a whole
//     folder can be shared wholesale (the `family/` folder shared with
//     relatives). This mirrors budget's `nsCloudPath` slot isolation —
//     the same "prepend a path segment" trick, but chosen at runtime.
//   - The local backend has no folders, so each namespace simply gets its
//     own localStorage key (see `namespaceLocalKey`).
//
// The slug is fixed at creation and is what every storage location is
// derived from; the display `name` is editable and never moves data. That
// keeps rename a cheap label change rather than a cross-backend folder
// move.

import { createLogger } from "../dev/logger.ts";

const log = createLogger("namespaces");

export type Namespace = {
  /**
   * Folder-/key-safe identifier, fixed at creation. Drives the cloud
   * folder path and the localStorage key. Never changes once allocated —
   * renaming only touches `name`.
   */
  slug: string;
  /** User-facing display name. Editable; does not move stored data. */
  name: string;
  /**
   * Optional icon the user picked for this namespace. The name of a glyph
   * in the namespace glyph set (see `src/ui/glyphs.ts`). When set, it
   * tints the namespace's row in the side menu and replaces the app
   * favicon while the namespace is active. Typed as a bare `string` here
   * so the storage layer stays free of any `ui/` dependency; the UI
   * validates it against the known glyph set on the way in.
   */
  glyph?: string;
  /**
   * Optional accent colour (a CSS colour string) the user picked for this
   * namespace. Tints the namespace's glyph in the side menu and the
   * favicon. Independent of `glyph`: a colour with no glyph still tints
   * the default folder icon.
   */
  color?: string;
};

/** A partial appearance change — set a field to a value, or `null` to clear it. */
export type NamespaceAppearance = {
  glyph?: string | null;
  color?: string | null;
};

export const DEFAULT_NAMESPACE_SLUG = "default";

export const DEFAULT_NAMESPACE: Namespace = {
  slug: DEFAULT_NAMESPACE_SLUG,
  name: "Default",
};

const LIST_KEY = "checklist:namespaces";
const ACTIVE_KEY = "checklist:namespace:active";
const ACTIVE_LIST_KEY_PREFIX = "checklist:list:active:";

// Longest slug we mint. Long enough to stay readable as a folder name,
// short enough to keep cloud paths well within every backend's limits.
const MAX_SLUG_LENGTH = 48;

function read(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch (err) {
    log.warn(`write failed for ${key}`, err);
  }
}

function isNamespace(value: unknown): value is Namespace {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Namespace).slug !== "string" ||
    typeof (value as Namespace).name !== "string" ||
    (value as Namespace).slug.length === 0
  ) {
    return false;
  }
  // Appearance fields are optional; reject only a present-but-wrong type so
  // a corrupt entry can't smuggle a non-string glyph/colour through.
  const { glyph, color } = value as Namespace;
  if (glyph !== undefined && typeof glyph !== "string") return false;
  if (color !== undefined && typeof color !== "string") return false;
  return true;
}

/**
 * Coerce any parsed value into a clean namespace list: drop non-namespace
 * entries, collapse duplicate slugs to the first seen, and materialise the
 * default namespace at the front. Shared by the localStorage reader and the
 * synced-registry parser so both apply identical validation.
 */
function normalizeNamespaceList(parsed: unknown): Namespace[] {
  const stored = Array.isArray(parsed) ? parsed.filter(isNamespace) : [];

  const seen = new Set<string>();
  const deduped: Namespace[] = [];
  for (const ns of stored) {
    if (seen.has(ns.slug)) continue;
    seen.add(ns.slug);
    deduped.push(ns);
  }

  const defaultEntry =
    deduped.find((n) => n.slug === DEFAULT_NAMESPACE_SLUG) ?? DEFAULT_NAMESPACE;
  const others = deduped.filter((n) => n.slug !== DEFAULT_NAMESPACE_SLUG);
  return [defaultEntry, ...others];
}

/**
 * The namespaces known on this device. The default namespace is always
 * present and sorts first; a custom display name the user gave it is
 * preserved. Duplicate slugs (a corrupt store) collapse to the first
 * seen.
 */
export function getNamespaces(): Namespace[] {
  const raw = read(LIST_KEY);
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  return normalizeNamespaceList(parsed);
}

/** Serialize a namespace list to the JSON written into `namespaces.json`. */
export function serializeNamespaces(list: Namespace[]): string {
  return JSON.stringify(list);
}

/**
 * Parse the raw `namespaces.json` text from a backend's root registry store
 * into a clean namespace list. A missing or corrupt blob yields just the
 * default namespace rather than throwing, mirroring `getNamespaces`.
 */
export function parseNamespaces(raw: string | null): Namespace[] {
  if (!raw) return normalizeNamespaceList(null);
  try {
    return normalizeNamespaceList(JSON.parse(raw));
  } catch {
    return normalizeNamespaceList(null);
  }
}

/**
 * Merge a device's local namespace list with the one a backend already
 * holds, for the "connect on a new device" reconcile. The backend wins on
 * any slug both sides know (it's the shared source of truth, so its display
 * name and appearance are adopted), and namespaces that exist only on this
 * device are carried over — so connecting publishes the device's own lists
 * to the cloud instead of dropping them. The result is normalised (default
 * first, deduped).
 */
export function mergeNamespaceLists(
  local: Namespace[],
  remote: Namespace[],
): Namespace[] {
  const bySlug = new Map<string, Namespace>();
  for (const ns of remote) if (!bySlug.has(ns.slug)) bySlug.set(ns.slug, ns);
  for (const ns of local) if (!bySlug.has(ns.slug)) bySlug.set(ns.slug, ns);
  return normalizeNamespaceList([...bySlug.values()]);
}

/**
 * Whether `local` carries any namespace the backend's `remote` list doesn't
 * yet have — i.e. whether a reconcile needs to push the merged list back up
 * to publish this device's own namespaces.
 */
export function hasLocalOnlyNamespaces(
  local: Namespace[],
  remote: Namespace[],
): boolean {
  const remoteSlugs = new Set(remote.map((n) => n.slug));
  return local.some((n) => !remoteSlugs.has(n.slug));
}

export function setNamespaces(list: Namespace[]): void {
  write(LIST_KEY, JSON.stringify(list));
}

/** The active namespace's slug, falling back to default when unset/unknown. */
export function getActiveNamespaceSlug(): string {
  const raw = read(ACTIVE_KEY);
  if (raw && getNamespaces().some((n) => n.slug === raw)) return raw;
  return DEFAULT_NAMESPACE_SLUG;
}

export function setActiveNamespaceSlug(slug: string): void {
  write(ACTIVE_KEY, slug);
}

/**
 * The id of the checklist the user last had open in `namespaceSlug`, or null
 * when none was ever recorded (or it was cleared). Device-local and scoped per
 * namespace — the same flavour of cursor as the active-namespace pointer above,
 * so a reload or an app update lands back on the list the user was looking at
 * instead of snapping to the first one. The caller still resolves it against
 * the live document (the stored list may have been archived or removed on
 * another device), so a stale id is harmless.
 */
export function getActiveChecklistId(namespaceSlug: string): string | null {
  return read(ACTIVE_LIST_KEY_PREFIX + namespaceSlug);
}

/** Record (or, with `null`, forget) the active checklist for `namespaceSlug`. */
export function setActiveChecklistId(
  namespaceSlug: string,
  id: string | null,
): void {
  const key = ACTIVE_LIST_KEY_PREFIX + namespaceSlug;
  if (id === null) {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
    } catch (err) {
      log.warn(`remove failed for ${key}`, err);
    }
    return;
  }
  write(key, id);
}

/**
 * Turn a free-text display name into a folder-/key-safe slug: lowercase,
 * non-alphanumerics collapsed to single hyphens, trimmed, length-capped.
 * May return an empty string for input with no usable characters — callers
 * substitute a fallback before allocating.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

/**
 * Create a namespace from a display name, allocating a unique slug. The
 * default slug is reserved, and a collision (the slug already exists)
 * disambiguates with a numeric suffix. Throws on an empty name.
 */
export function addNamespace(name: string): Namespace {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A namespace name is required");
  const base = slugify(trimmed) || "namespace";
  const taken = new Set(getNamespaces().map((n) => n.slug));
  let slug = base;
  let counter = 2;
  while (taken.has(slug)) {
    slug = `${base}-${counter++}`;
  }
  const created: Namespace = { slug, name: trimmed };
  setNamespaces([...getNamespaces(), created]);
  log.info(`added namespace slug=${slug}`);
  return created;
}

/** Change a namespace's display name (the slug, and its data, stay put). */
export function renameNamespace(slug: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A namespace name is required");
  setNamespaces(
    getNamespaces().map((n) => (n.slug === slug ? { ...n, name: trimmed } : n)),
  );
}

/**
 * Set or clear a namespace's appearance (its icon and/or accent colour).
 * Passing `null` for a field clears it. Works for the default namespace
 * too: `getNamespaces` always materialises the default, so writing the
 * mapped list persists whatever appearance the default was given.
 */
export function setNamespaceAppearance(
  slug: string,
  patch: NamespaceAppearance,
): void {
  setNamespaces(
    getNamespaces().map((n) => {
      if (n.slug !== slug) return n;
      const next: Namespace = { ...n };
      if ("glyph" in patch) {
        if (patch.glyph) next.glyph = patch.glyph;
        else delete next.glyph;
      }
      if ("color" in patch) {
        if (patch.color) next.color = patch.color;
        else delete next.color;
      }
      return next;
    }),
  );
}

/**
 * Remove a namespace from the registry. The default namespace can't be
 * removed. If the removed namespace was active, the active pointer falls
 * back to default. Removing the *data* (the cloud folder or local key) is
 * the caller's job — this only touches the registry.
 */
export function removeNamespace(slug: string): void {
  if (slug === DEFAULT_NAMESPACE_SLUG) {
    throw new Error("The default namespace can't be removed");
  }
  setNamespaces(getNamespaces().filter((n) => n.slug !== slug));
  if (getActiveNamespaceSlug() === slug) {
    setActiveNamespaceSlug(DEFAULT_NAMESPACE_SLUG);
  }
}

/**
 * localStorage key for a namespace's document. The default namespace keeps
 * the historical `checklist:v1` key so existing local data is picked up
 * with no migration; every other namespace gets a per-slug suffix.
 */
export function namespaceLocalKey(slug: string): string {
  return slug === DEFAULT_NAMESPACE_SLUG
    ? "checklist:v1"
    : `checklist:v1:${slug}`;
}

/**
 * Cloud folder name for a namespace. Every namespace — including the
 * default — lives in its own folder so the folder can be shared wholesale.
 * The legacy single-file location (the document at the app-folder root) is
 * migrated into the `default/` folder by the cloud adapters on first load.
 */
export function namespaceCloudFolder(slug: string): string {
  return slug;
}
