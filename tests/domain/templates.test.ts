import { describe, expect, it } from "vitest";
import {
  addItem,
  deleteItem,
  instantiate,
  moveItemInto,
  setCategory,
  toggleItem,
} from "../../src/domain/checklists.ts";
import {
  addTemplate,
  createTemplate,
  extractTemplate,
  removeTemplate,
  renameTemplate,
} from "../../src/domain/templates.ts";
import type {
  Checklist,
  ChecklistItem,
  Snapshot,
  Template,
} from "../../src/domain/types.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

// Deterministic id factory — the domain layer never mints ids itself, so both
// halves of the template round trip take one.
function ids(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/**
 * A checklist exercising every field a template is supposed to capture:
 * a category header with nested children, notes, a required flag, a deadline
 * with a recurrence, a checked item, and an archived one.
 */
function richChecklist(): Checklist {
  const items: ChecklistItem[] = [
    {
      id: "c1",
      title: "Documents",
      checked: false,
      category: true,
      children: [
        {
          id: "c1a",
          title: "Passport",
          checked: true,
          checkedAt: NOW,
          required: true,
        },
        {
          id: "c1b",
          title: "Insurance",
          checked: false,
          notes: "Renew first",
          deadline: "2026-03-01",
          recurrence: { unit: "year", interval: 1 },
        },
      ],
    },
    { id: "c2", title: "Charger", checked: true, checkedAt: NOW },
    { id: "c3", title: "Old thing", checked: true, archived: true },
  ];
  return {
    version: 1,
    id: "list-1",
    templateId: "",
    name: "Weekend trip",
    items,
    glyph: "plane",
    color: "#ff8800",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("templates", () => {
  it("creates a template with trimmed name and no items", () => {
    const t = createTemplate({ id: "t1", name: "  Packing  ", now: NOW });
    expect(t.name).toBe("Packing");
    expect(t.items).toEqual([]);
    expect(t.createdAt).toBe(NOW);
    expect(t.updatedAt).toBe(NOW);
    expect(t.version).toBe(1);
  });

  it("renames a template, ignoring a blank or unchanged name", () => {
    const t = createTemplate({ id: "t1", name: "Old", now: NOW });
    expect(renameTemplate(t, " New ", LATER).name).toBe("New");
    // A no-op returns the same object, so it never bumps `updatedAt` or writes.
    expect(renameTemplate(t, "  ", LATER)).toBe(t);
    expect(renameTemplate(t, "Old", LATER)).toBe(t);
  });

  it("adds and removes templates on the snapshot", () => {
    const snap: Snapshot = { templates: [], checklists: [] };
    const t = createTemplate({ id: "t1", name: "Packing", now: NOW });
    const withTemplate = addTemplate(snap, t);
    expect(withTemplate.templates).toHaveLength(1);
    expect(snap.templates).toHaveLength(0); // original untouched
    expect(removeTemplate(withTemplate, "t1").templates).toHaveLength(0);
    // An unknown id is a no-op and returns the same snapshot.
    expect(removeTemplate(withTemplate, "nope")).toBe(withTemplate);
  });
});

describe("extractTemplate", () => {
  it("mirrors the whole item tree, unchecked", () => {
    const tpl = extractTemplate(richChecklist(), "t1", LATER, ids("n"));

    expect(tpl.name).toBe("Weekend trip");
    // The category header and its two children survive as a tree.
    expect(tpl.items).toHaveLength(2);
    const [documents, charger] = tpl.items;
    expect(documents?.title).toBe("Documents");
    expect(documents?.category).toBe(true);
    expect(documents?.children).toHaveLength(2);
    expect(charger?.title).toBe("Charger");

    // Notes, required flags, deadlines, and recurrences all come across.
    const [passport, insurance] = documents!.children!;
    expect(passport?.required).toBe(true);
    expect(insurance?.notes).toBe("Renew first");
    expect(insurance?.deadline).toBe("2026-03-01");
    expect(insurance?.recurrence).toEqual({ unit: "year", interval: 1 });
  });

  it("drops the run-specific state: checked, checkedAt, and archived items", () => {
    const tpl = extractTemplate(richChecklist(), "t1", LATER, ids("n"));

    const flat = [...tpl.items, ...(tpl.items[0]?.children ?? [])];
    for (const item of flat) {
      expect(item.checked).toBe(false);
      expect(item.checkedAt).toBeUndefined();
      expect(item.archived).toBeUndefined();
    }
    // "Old thing" was archived on the source list, so it isn't captured at all.
    expect(tpl.items.map((i) => i.title)).not.toContain("Old thing");
  });

  it("carries the list's icon and colour", () => {
    const tpl = extractTemplate(richChecklist(), "t1", LATER, ids("n"));
    expect(tpl.glyph).toBe("plane");
    expect(tpl.color).toBe("#ff8800");
  });

  it("leaves glyph and colour off an unstyled list", () => {
    const source = richChecklist();
    delete source.glyph;
    delete source.color;
    const tpl = extractTemplate(source, "t1", LATER, ids("n"));
    expect("glyph" in tpl).toBe(false);
    expect("color" in tpl).toBe(false);
  });

  it("mints fresh ids so the template is independent of its source", () => {
    const source = richChecklist();
    const tpl = extractTemplate(source, "t1", LATER, ids("n"));

    const templateIds = [
      ...tpl.items.map((i) => i.id),
      ...(tpl.items[0]?.children ?? []).map((i) => i.id),
    ];
    for (const id of templateIds) expect(id).toMatch(/^n\d+$/);
    // Editing the template can't reach into the checklist it came from.
    const edited = deleteItem(tpl, tpl.items[0]!.id, LATER);
    expect(edited.items).toHaveLength(1);
    expect(source.items).toHaveLength(3);
  });
});

describe("the template round trip", () => {
  it("stamps a list back out with the tree intact and nothing checked", () => {
    const tpl = extractTemplate(richChecklist(), "t1", LATER, ids("n"));
    const list = instantiate(tpl, "list-2", LATER, ids("m"));

    expect(list.templateId).toBe("t1");
    expect(list.name).toBe("Weekend trip");
    expect(list.glyph).toBe("plane");
    expect(list.color).toBe("#ff8800");

    const documents = list.items[0]!;
    expect(documents.category).toBe(true);
    expect(documents.children?.map((i) => i.title)).toEqual([
      "Passport",
      "Insurance",
    ]);
    expect(documents.children?.[0]?.required).toBe(true);
    expect(documents.children?.[1]?.deadline).toBe("2026-03-01");
    expect(list.items.every((i) => !i.checked)).toBe(true);
  });

  it("keeps the stamped list and its template fully independent", () => {
    const tpl = extractTemplate(richChecklist(), "t1", LATER, ids("n"));
    const list = instantiate(tpl, "list-2", LATER, ids("m"));

    // Checking things off the list leaves the template pristine …
    const worked = toggleItem(list, list.items[1]!.id, LATER);
    expect(worked.items[1]?.checked).toBe(true);
    expect(tpl.items[1]?.checked).toBe(false);

    // … and editing the template never reaches lists already stamped from it.
    const grown = addItem(tpl, { id: "extra", title: "Snacks" }, LATER);
    expect(grown.items).toHaveLength(3);
    expect(list.items).toHaveLength(2);
  });
});

describe("templates share the checklist item verbs", () => {
  // The point of mirroring the data model: a template is edited by exactly the
  // same generic operations a checklist is, with no template-specific variants.
  const base = (): Template =>
    createTemplate({
      id: "t1",
      name: "Packing",
      now: NOW,
      items: [
        { id: "i1", title: "Passport", checked: false },
        { id: "i2", title: "Charger", checked: false },
      ],
    });

  it("adds, nests, and categorises items", () => {
    const grown = addItem(base(), { id: "i3", title: "Toiletries" }, LATER);
    expect(grown.items).toHaveLength(3);
    expect(grown.updatedAt).toBe(LATER);

    const nested = moveItemInto(grown, "i2", "i1", "into", LATER);
    expect(nested.items).toHaveLength(2);
    expect(nested.items[0]?.children?.[0]?.id).toBe("i2");

    const categorised = setCategory(nested, "i1", true, LATER);
    expect(categorised.items[0]?.category).toBe(true);
  });

  it("deletes an item without mutating the original", () => {
    const t = base();
    const pruned = deleteItem(t, "i1", LATER);
    expect(pruned.items.map((i) => i.id)).toEqual(["i2"]);
    expect(t.items).toHaveLength(2);
  });
});
