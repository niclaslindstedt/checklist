// Best-effort cross-namespace document write, shared by the checklist- and
// folder-move verbs in `useStorageBackend`. Pulled out of the hook so the
// load → transform → save → result shape (and its save-failure path) is
// directly unit-testable against a mock adapter, without standing up the whole
// backend hook on a real backend.

import type { Snapshot } from "../domain/types.ts";
import type { StorageAdapter } from "./adapter.ts";
import { parse, serialize } from "./serialize.ts";

/**
 * The outcome of a cross-namespace move write. The two move verbs log their
 * own success / failure line (the labels differ per verb), so on failure the
 * result carries the thrown error for the caller to log rather than swallowing
 * it here.
 */
export type MoveResult = { ok: true } | { ok: false; error: unknown };

/**
 * Load the target adapter's current document (a load failure is treated as an
 * empty document, so a never-written namespace still receives the move),
 * apply `transform`, and save the result at the loaded revision. Best-effort:
 * a failed save (offline cloud, locked, revision conflict) resolves
 * `{ ok: false, error }` and leaves the target untouched, so the caller only
 * drops its source copy when the result is `ok`.
 */
export async function writeMovedDocument(
  target: StorageAdapter,
  transform: (doc: Snapshot) => Snapshot,
): Promise<MoveResult> {
  const prev = await target.load().catch(() => null);
  const doc = transform(parse(prev?.text ?? null));
  try {
    await target.save(serialize(doc), prev?.revision);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
