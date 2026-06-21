// The parse / serialize seam every adapter runs through. Adapters carry
// opaque bytes (see `./adapter.ts`); this module is the one place that
// turns a domain `Snapshot` into the stored text and back, so the
// forward-only migration chain (`./migrations.ts`) and defensive parsing
// live here instead of being duplicated per backend. This is the
// checklist's analog of the budget project's `storage/file.ts`.
//
// Versioning lives in the bytes, not in the domain `Snapshot`: the
// stored JSON carries a top-level `version` that `parse` migrates
// forward and `serialize` stamps, while `domain/` keeps working with the
// version-free `Snapshot` shape.

import { emptySnapshot, type Folder, type Snapshot } from "../domain/types.ts";
import { createLogger } from "../dev/logger.ts";
import { LATEST_VERSION, migrate } from "./migrations.ts";

const log = createLogger("serialize");

function isFolder(value: unknown): value is Folder {
  if (!value || typeof value !== "object") return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.id === "string" &&
    f.id.length > 0 &&
    typeof f.name === "string" &&
    typeof f.createdAt === "string"
  );
}

/**
 * Parse a folder registry defensively: drop malformed entries and collapse
 * duplicate ids, keeping the first. Used both for the `folders` array inside a
 * document and to parse a standalone `folders.json` sidecar through the same
 * validation.
 */
export function parseFolders(value: unknown): Folder[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: Folder[] = [];
  for (const entry of value) {
    if (!isFolder(entry)) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push({ id: entry.id, name: entry.name, createdAt: entry.createdAt });
  }
  return out;
}

/** Serialize a folder registry to the JSON stored in a `folders.json` sidecar. */
export function serializeFolders(folders: readonly Folder[]): string {
  return JSON.stringify(folders);
}

/** Produce the canonical stored text for a document (trailing newline). */
export function serialize(snapshot: Snapshot): string {
  const text =
    JSON.stringify({ version: LATEST_VERSION, ...snapshot }, null, 2) + "\n";
  log.info(
    `serialize: v${LATEST_VERSION}, ${snapshot.templates.length} templates, ` +
      `${snapshot.checklists.length} lists → ${text.length} B`,
  );
  return text;
}

/**
 * Parse stored text back into a `Snapshot`, running the migration chain
 * and tolerating absent or corrupt bytes by falling back to an empty
 * document. A document written by a newer build (migration throws) also
 * falls back to empty rather than crashing the load.
 */
export function parse(text: string | null | undefined): Snapshot {
  if (!text) {
    log.info("parse: no bytes — empty document");
    return emptySnapshot();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    log.warn(`parse: invalid JSON (${text.length} B) — falling back to empty`);
    return emptySnapshot();
  }
  const fromVersion =
    typeof (raw as { version?: unknown })?.version === "number"
      ? (raw as { version: number }).version
      : "?";
  let migrated: unknown;
  try {
    migrated = migrate(raw).data;
  } catch (err) {
    log.error("parse: migration failed — falling back to empty document", err);
    return emptySnapshot();
  }
  const doc = migrated as Partial<Snapshot>;
  const snapshot: Snapshot = {
    templates: doc.templates ?? [],
    checklists: doc.checklists ?? [],
  };
  const folders = parseFolders(doc.folders);
  // Absent rather than an empty array when no folders exist, so a folder-less
  // document round-trips byte-for-byte.
  if (folders.length > 0) snapshot.folders = folders;
  log.info(
    `parse: migrated v${fromVersion}→v${LATEST_VERSION}, ` +
      `${snapshot.templates.length} templates, ${snapshot.checklists.length} lists, ` +
      `${folders.length} folders`,
  );
  return snapshot;
}
