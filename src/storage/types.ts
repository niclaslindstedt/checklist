// The pluggable persistence contract. Every backend (LocalStorage, Google
// Drive, Dropbox) implements this same interface so the UI can treat them
// interchangeably. Backends import from domain/ for the model types only.

import type { Checklist, Snapshot, Template } from "../domain/types.ts";

export type Unsubscribe = () => void;

export interface StorageBackend {
  /** Load the full document. */
  loadAll(): Promise<Snapshot>;
  saveTemplate(template: Template): Promise<void>;
  saveChecklist(checklist: Checklist): Promise<void>;
  /** Remove a template or checklist by id. */
  delete(id: string): Promise<void>;
  /** Observe changes; returns a function that cancels the subscription. */
  subscribe(fn: (snapshot: Snapshot) => void): Unsubscribe;
}
