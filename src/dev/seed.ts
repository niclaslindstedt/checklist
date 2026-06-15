// Sample document for the developer "Fake data" toggle. A pure builder —
// returns a fresh `Snapshot` each call so edits during a fake-data
// session never mutate this template. Loaded through the in-memory seed
// adapter (`src/storage/dev-seed/index.ts`), never persisted.

import type { Checklist, Snapshot, Template } from "../domain/types.ts";

const STAMP = "2024-01-01T00:00:00.000Z";

function template(
  id: string,
  name: string,
  items: { id: string; title: string; notes?: string; required?: boolean }[],
): Template {
  return {
    version: 1,
    id,
    name,
    items,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

function checklist(
  id: string,
  templateId: string,
  name: string,
  items: {
    id: string;
    title: string;
    checked: boolean;
    notes?: string;
    archived?: boolean;
  }[],
): Checklist {
  return {
    version: 1,
    id,
    templateId,
    name,
    items,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

/** Build a fresh sample document: a couple of templates and an active list. */
export function buildSeedSnapshot(): Snapshot {
  return {
    templates: [
      template("tpl-trip", "Weekend trip", [
        { id: "t1", title: "Passport / ID", required: true },
        { id: "t2", title: "Charger + cables" },
        { id: "t3", title: "Toiletries" },
        { id: "t4", title: "Book the dog sitter", notes: "Call by Thursday" },
      ]),
      template("tpl-deploy", "Release checklist", [
        { id: "d1", title: "Run the full test suite", required: true },
        { id: "d2", title: "Bump the version" },
        { id: "d3", title: "Write the changeset" },
        { id: "d4", title: "Tag and push" },
      ]),
    ],
    checklists: [
      checklist("cl-groceries", "", "Groceries", [
        { id: "g1", title: "Oat milk", checked: true },
        { id: "g2", title: "Sourdough", checked: true },
        { id: "g3", title: "Coffee beans", checked: false },
        { id: "g4", title: "Spinach", checked: false },
        {
          id: "g5",
          title: "Olive oil",
          checked: false,
          notes: "the green tin",
        },
        { id: "g6", title: "Tinfoil", checked: false, archived: true },
      ]),
    ],
  };
}
