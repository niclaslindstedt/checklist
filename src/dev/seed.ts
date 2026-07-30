// Sample document for the developer "Fake data" toggle. A pure builder —
// returns a fresh `Snapshot` each call so edits during a fake-data
// session never mutate this template. Loaded through the in-memory seed
// adapter (`src/storage/dev-seed/index.ts`), never persisted.

import type {
  Checklist,
  ChecklistItem,
  Snapshot,
  Template,
} from "../domain/types.ts";

const STAMP = "2024-01-01T00:00:00.000Z";

/**
 * A seed template item. Templates carry the checklist item model, so this
 * mirrors what a list can hold — sub-items and category headers included —
 * minus the run-specific state a stored template never has.
 */
type SeedTemplateItem = {
  id: string;
  title: string;
  notes?: string;
  required?: boolean;
  category?: boolean;
  children?: SeedTemplateItem[];
};

// Every item in a stored template is unchecked, so the flag is stamped here
// rather than spelled out at each of the seed's call sites.
function templateItem(raw: SeedTemplateItem): ChecklistItem {
  const item: ChecklistItem = { id: raw.id, title: raw.title, checked: false };
  if (raw.notes) item.notes = raw.notes;
  if (raw.required) item.required = true;
  if (raw.category) item.category = true;
  if (raw.children) item.children = raw.children.map(templateItem);
  return item;
}

function template(
  id: string,
  name: string,
  items: SeedTemplateItem[],
): Template {
  return {
    version: 1,
    id,
    name,
    items: items.map(templateItem),
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
  folderId?: string,
): Checklist {
  return {
    version: 1,
    id,
    templateId,
    name,
    items,
    ...(folderId ? { folderId } : {}),
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

/** Build a fresh sample document: a couple of templates and an active list. */
export function buildSeedSnapshot(): Snapshot {
  return {
    templates: [
      // Nested under a category header, so the seed exercises the fact that a
      // template holds the same item tree a checklist does.
      template("tpl-trip", "Weekend trip", [
        {
          id: "t1",
          title: "Documents",
          category: true,
          children: [
            { id: "t1a", title: "Passport / ID", required: true },
            { id: "t1b", title: "Travel insurance" },
          ],
        },
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
    // A "Home" folder groups a couple of household lists; Groceries stays
    // ungrouped at the top level, so the seed shows both shapes.
    folders: [{ id: "fld-home", name: "Home", createdAt: STAMP }],
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
      checklist(
        "cl-chores",
        "",
        "Weekend chores",
        [
          { id: "c1", title: "Water the plants", checked: false },
          { id: "c2", title: "Laundry", checked: true },
          { id: "c3", title: "Vacuum", checked: false },
        ],
        "fld-home",
      ),
      checklist(
        "cl-pantry",
        "",
        "Pantry restock",
        [
          { id: "p1", title: "Rice", checked: false },
          { id: "p2", title: "Pasta", checked: false },
          { id: "p3", title: "Tinned tomatoes", checked: true },
        ],
        "fld-home",
      ),
    ],
  };
}
