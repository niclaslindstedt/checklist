// Top-level application state. This is the one place that wires the pure
// domain operations to a concrete StorageBackend and supplies the side-effects
// (id generation, clock) that domain functions deliberately do not perform.

import { instantiate } from "../domain/checklists.ts";
import { createTemplate } from "../domain/templates.ts";
import type { Snapshot, Template } from "../domain/types.ts";
import { LocalStorageBackend } from "../storage/local/index.ts";
import type { StorageBackend } from "../storage/types.ts";

export interface AppState {
  newTemplate(name: string): Promise<Template>;
  newChecklist(template: Template): Promise<void>;
  load(): Promise<Snapshot>;
  backend: StorageBackend;
}

const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();

export function createAppState(
  backend: StorageBackend = new LocalStorageBackend(),
): AppState {
  return {
    backend,
    async newTemplate(name: string): Promise<Template> {
      const template = createTemplate({ id: newId(), name, now: now() });
      await backend.saveTemplate(template);
      return template;
    },
    async newChecklist(template: Template): Promise<void> {
      await backend.saveChecklist(instantiate(template, newId(), now()));
    },
    load(): Promise<Snapshot> {
      return backend.loadAll();
    },
  };
}
