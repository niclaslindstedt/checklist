// Default storage backend: a single JSON document in localStorage under
// the key `checklist:v1`. Speaks bytes through the `StorageAdapter`
// contract (see ../adapter.ts) — the serialize / parse pipeline lives in
// ../serialize.ts, so this adapter only moves text in and out of a
// `Storage`. The Storage object is injectable so tests run against an
// in-memory stub instead of the real `localStorage`.

import type { StorageAdapter, StoredSnapshot } from "../adapter.ts";

const STORAGE_KEY = "checklist:v1";

export class BrowserLocalStorageAdapter implements StorageAdapter {
  readonly id = "browser" as const;
  readonly label = "This device";
  readonly capabilities: ReadonlySet<"loadSync"> = new Set(["loadSync"]);

  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  loadSync(): StoredSnapshot | null {
    const text = this.read();
    return text === null ? null : { text };
  }

  async load(): Promise<StoredSnapshot | null> {
    return this.loadSync();
  }

  async save(text: string): Promise<StoredSnapshot> {
    this.storage.setItem(STORAGE_KEY, text);
    return { text };
  }

  private read(): string | null {
    try {
      return this.storage.getItem(STORAGE_KEY);
    } catch {
      // disabled / blocked storage — treat as "no data"
      return null;
    }
  }
}
