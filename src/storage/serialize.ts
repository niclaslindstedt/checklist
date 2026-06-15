// The parse / serialize seam every adapter runs through. Adapters carry
// opaque bytes (see `./adapter.ts`); this module is the one place that
// turns a domain `Snapshot` into the stored text and back, so migration
// and defensive parsing live here instead of being duplicated per
// backend.

import { emptySnapshot, type Snapshot } from "../domain/types.ts";

/** Produce the canonical stored text for a document (trailing newline). */
export function serialize(snapshot: Snapshot): string {
  return JSON.stringify(snapshot, null, 2) + "\n";
}

/**
 * Parse stored text back into a `Snapshot`, tolerating absent or corrupt
 * bytes by falling back to an empty document. Missing top-level arrays
 * default to empty so a partially-written file still loads.
 */
export function parse(text: string | null | undefined): Snapshot {
  if (!text) return emptySnapshot();
  try {
    const parsed = JSON.parse(text) as Partial<Snapshot>;
    return {
      templates: parsed.templates ?? [],
      checklists: parsed.checklists ?? [],
    };
  } catch {
    return emptySnapshot();
  }
}
