// Per-device registry of namespaces, plus the path/key helpers that map a
// namespace onto a concrete storage location. A namespace is a named
// bucket holding its own checklist document: switching the active
// namespace swaps which document the app reads and writes.
//
// Why per-device (localStorage), like `backend-preference.ts`: the list of
// namespaces a person sees is a property of *their* install, not of any
// one document. A family member who has the shared Dropbox `family/`
// folder synced into their own account adds a "Family" namespace on their
// device pointing at that folder; they don't inherit the owner's list.
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
};

export const DEFAULT_NAMESPACE_SLUG = "default";

export const DEFAULT_NAMESPACE: Namespace = {
  slug: DEFAULT_NAMESPACE_SLUG,
  name: "Default",
};

const LIST_KEY = "checklist:namespaces";
const ACTIVE_KEY = "checklist:namespace:active";

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
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Namespace).slug === "string" &&
    typeof (value as Namespace).name === "string" &&
    (value as Namespace).slug.length > 0
  );
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
