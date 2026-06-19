// Default storage backend: a single JSON document in localStorage. Speaks
// bytes through the `StorageAdapter` contract (see ../adapter.ts) — the
// serialize / parse pipeline lives in ../serialize.ts, so this adapter
// only moves text in and out of a `Storage`. The Storage object is
// injectable so tests run against an in-memory stub instead of the real
// `localStorage`.
//
// Each namespace gets its own key (see `namespaceLocalKey`). The default
// namespace keeps the historical `checklist:v1` key so data written before
// namespaces existed is read back unchanged; other namespaces are keyed
// `checklist:v1:<slug>`. The local backend has no folders, so namespacing
// here is purely a key change — there is nothing to relocate.

import { createLogger } from "../../dev/logger.ts";
import type { StorageAdapter, StoredSnapshot } from "../adapter.ts";
import { DEFAULT_NAMESPACE_SLUG, namespaceLocalKey } from "../namespaces.ts";

const log = createLogger("local");

export class BrowserLocalStorageAdapter implements StorageAdapter {
  readonly id = "browser" as const;
  readonly label = "This device";
  readonly capabilities: ReadonlySet<"loadSync"> = new Set(["loadSync"]);

  private readonly key: string;

  constructor(
    private readonly storage: Storage = globalThis.localStorage,
    namespace: string = DEFAULT_NAMESPACE_SLUG,
  ) {
    this.key = namespaceLocalKey(namespace);
  }

  loadSync(): StoredSnapshot | null {
    const text = this.read();
    if (text === null) {
      log.info(`loadSync: no document at [${this.key}]`);
      return null;
    }
    log.info(`loadSync: read ${text.length} B from [${this.key}]`);
    return { text };
  }

  async load(): Promise<StoredSnapshot | null> {
    return this.loadSync();
  }

  async save(text: string): Promise<StoredSnapshot> {
    try {
      this.storage.setItem(this.key, text);
      log.info(`save: wrote ${text.length} B to [${this.key}]`);
    } catch (err) {
      // Quota exceeded, or disabled / blocked storage. Surface it so a
      // silently-failing localStorage save is debuggable, then rethrow —
      // the sync engine treats a thrown save as a failed write.
      log.error(`save: write to [${this.key}] failed`, err);
      throw err;
    }
    return { text };
  }

  private read(): string | null {
    try {
      return this.storage.getItem(this.key);
    } catch (err) {
      // disabled / blocked storage — treat as "no data"
      log.warn(`read: [${this.key}] unavailable — treating as empty`, err);
      return null;
    }
  }
}

/**
 * Delete a namespace's local document. Best-effort: a blocked / disabled
 * `Storage` is treated as "nothing to remove". Used when a namespace is
 * deleted while the local backend is active.
 */
export function deleteLocalNamespace(
  namespace: string,
  storage: Storage = globalThis.localStorage,
): void {
  try {
    storage.removeItem(namespaceLocalKey(namespace));
  } catch {
    // best-effort
  }
}
