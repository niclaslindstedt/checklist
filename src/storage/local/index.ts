// Default storage backend: a single JSON document in localStorage under the
// key `checklist:v1`. Larger blobs may move to IndexedDB later; the public
// surface is the StorageBackend interface in ../types.ts.

import {
  emptySnapshot,
  type Checklist,
  type Snapshot,
  type Template,
} from "../../domain/types.ts";
import type { StorageBackend, Unsubscribe } from "../types.ts";

const STORAGE_KEY = "checklist:v1";

export class LocalStorageBackend implements StorageBackend {
  private readonly subscribers = new Set<(snapshot: Snapshot) => void>();

  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  async loadAll(): Promise<Snapshot> {
    return this.read();
  }

  async saveTemplate(template: Template): Promise<void> {
    const snapshot = this.read();
    snapshot.templates = upsert(snapshot.templates, template);
    this.write(snapshot);
  }

  async saveChecklist(checklist: Checklist): Promise<void> {
    const snapshot = this.read();
    snapshot.checklists = upsert(snapshot.checklists, checklist);
    this.write(snapshot);
  }

  async delete(id: string): Promise<void> {
    const snapshot = this.read();
    snapshot.templates = snapshot.templates.filter((t) => t.id !== id);
    snapshot.checklists = snapshot.checklists.filter((c) => c.id !== id);
    this.write(snapshot);
  }

  subscribe(fn: (snapshot: Snapshot) => void): Unsubscribe {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private read(): Snapshot {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return emptySnapshot();
    try {
      const parsed = JSON.parse(raw) as Partial<Snapshot>;
      return {
        templates: parsed.templates ?? [],
        checklists: parsed.checklists ?? [],
      };
    } catch {
      return emptySnapshot();
    }
  }

  private write(snapshot: Snapshot): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    for (const fn of this.subscribers) fn(snapshot);
  }
}

function upsert<T extends { id: string }>(list: T[], next: T): T[] {
  const idx = list.findIndex((item) => item.id === next.id);
  if (idx === -1) return [...list, next];
  const copy = [...list];
  copy[idx] = next;
  return copy;
}
