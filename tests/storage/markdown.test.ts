import { describe, expect, it } from "vitest";

import type { Checklist, Snapshot, Template } from "../../src/domain/types.ts";
import {
  checklistBodyMarkdown,
  checklistToMarkdown,
  entryFileStem,
  filesToSnapshot,
  parseEntry,
  parseItemsFromMarkdown,
  snapshotToFiles,
  templateToMarkdown,
} from "../../src/storage/markdown/codec.ts";

const template: Template = {
  version: 1,
  id: "tpl-aaaaaa",
  name: "Trip packing",
  items: [
    { id: "x", title: "Passport", required: true },
    { id: "y", title: "Charger", notes: "USB-C" },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const checklist: Checklist = {
  version: 1,
  id: "cl-bbbbbb",
  templateId: "tpl-aaaaaa",
  name: "Groceries",
  items: [
    { id: "1", title: "Milk", checked: false },
    { id: "2", title: "Bread", checked: true, notes: "Whole grain" },
    { id: "3", title: "Eggs", checked: true, required: true },
    { id: "4", title: "Old thing", checked: true, archived: true },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

// Compare ignoring item ids, which the codec regenerates deterministically.
function normalize(snapshot: Snapshot): unknown {
  const stripItems = (items: { id: string }[]) =>
    items.map(({ id: _id, ...rest }) => rest);
  return {
    templates: snapshot.templates.map((t) => ({
      ...t,
      items: stripItems(t.items),
    })),
    checklists: snapshot.checklists.map((c) => ({
      ...c,
      items: stripItems(c.items),
    })),
  };
}

describe("markdown codec", () => {
  it("renders a checklist as standard task-list markdown", () => {
    const md = checklistToMarkdown(checklist);
    expect(md).toContain("# Groceries");
    expect(md).toContain("- [ ] Milk");
    expect(md).toContain("- [x] Bread");
    expect(md).toContain("  Whole grain");
    expect(md).toContain("- [x] Eggs *(required)*");
    expect(md).toContain("## Archived");
    expect(md).toContain("- [x] Old thing");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("renders a template as a plain bullet list", () => {
    const md = templateToMarkdown(template);
    expect(md).toContain("type: template");
    expect(md).toContain("# Trip packing");
    expect(md).toContain("- Passport *(required)*");
    expect(md).toContain("- Charger");
    expect(md).toContain("  USB-C");
    expect(md).not.toContain("[ ]");
  });

  it("round-trips a snapshot through files (modulo item ids)", () => {
    const snapshot: Snapshot = {
      templates: [template],
      checklists: [checklist],
    };
    const files = snapshotToFiles(snapshot);
    const back = filesToSnapshot(files);
    expect(normalize(back)).toEqual(normalize(snapshot));
  });

  it("regenerates item ids deterministically (idempotent loads)", () => {
    const files = snapshotToFiles({ templates: [], checklists: [checklist] });
    const a = filesToSnapshot(files);
    const b = filesToSnapshot(files);
    expect(a.checklists[0]!.items.map((i) => i.id)).toEqual(
      b.checklists[0]!.items.map((i) => i.id),
    );
  });

  it("derives a readable, collision-resistant file stem", () => {
    expect(entryFileStem("Groceries", "cl-bbbbbb")).toBe("groceries-bbbbbb");
    expect(entryFileStem("  ", "cl-123456")).toBe("list-123456");
  });

  it("preserves the templateId link on a checklist", () => {
    const md = checklistToMarkdown(checklist);
    const parsed = parseEntry(md);
    expect(parsed?.kind).toBe("checklist");
    if (parsed?.kind === "checklist") {
      expect(parsed.checklist.templateId).toBe("tpl-aaaaaa");
    }
  });

  it("skips files with missing frontmatter or id", () => {
    expect(parseEntry("# No frontmatter\n- [ ] x")).toBeNull();
    expect(parseEntry("---\ntype: checklist\n---\n# x")).toBeNull();
  });

  it("round-trips a multi-paragraph note (a blank line inside the note)", () => {
    // A blank line within a note renders as the bare two-space indent; it
    // must fold back into the note rather than orphaning everything after
    // it. Regression for the dropped-second-paragraph bug.
    const withNote: Checklist = {
      version: 1,
      id: "cl-note",
      templateId: "",
      name: "Notes",
      items: [
        { id: "1", title: "Item", checked: false, notes: "para1\n\npara2" },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const parsed = parseEntry(checklistToMarkdown(withNote));
    expect(parsed?.kind).toBe("checklist");
    if (parsed?.kind === "checklist") {
      expect(parsed.checklist.items[0]!.notes).toBe("para1\n\npara2");
    }
  });

  it("imports a pasted multi-paragraph note unbroken", () => {
    const items = parseItemsFromMarkdown(
      "- [ ] Item\n  para1\n  \n  para2\n- [x] Next",
    );
    expect(items).toEqual([
      {
        title: "Item",
        checked: false,
        required: false,
        notes: "para1\n\npara2",
      },
      { title: "Next", checked: true, required: false },
    ]);
  });

  describe("checklistBodyMarkdown", () => {
    it("renders the checklist without persistence frontmatter", () => {
      const body = checklistBodyMarkdown(checklist);
      expect(body).not.toContain("---");
      expect(body).not.toContain("type: checklist");
      expect(body.startsWith("# Groceries")).toBe(true);
      expect(body).toContain("- [ ] Milk");
      expect(body).toContain("- [x] Bread");
      expect(body).toContain("## Archived");
      expect(body.endsWith("\n")).toBe(true);
    });

    it("is the frontmatter-stripped tail of the full markdown", () => {
      const full = checklistToMarkdown(checklist);
      const body = checklistBodyMarkdown(checklist);
      expect(full.endsWith(body)).toBe(true);
    });
  });

  describe("nested sub-items", () => {
    const nested: Checklist = {
      version: 1,
      id: "cl-nest",
      templateId: "",
      name: "Project",
      items: [
        {
          id: "p",
          title: "Parent",
          checked: false,
          children: [
            { id: "c1", title: "Child A", checked: true },
            {
              id: "c2",
              title: "Child B",
              checked: false,
              notes: "with a note",
              children: [{ id: "g", title: "Grandchild", checked: false }],
            },
          ],
        },
        { id: "flat", title: "Standalone", checked: false },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    it("renders sub-items indented two spaces per level", () => {
      const md = checklistBodyMarkdown(nested);
      expect(md).toContain("- [ ] Parent");
      expect(md).toContain("  - [x] Child A");
      expect(md).toContain("  - [ ] Child B");
      expect(md).toContain("    with a note");
      expect(md).toContain("    - [ ] Grandchild");
    });

    it("round-trips the tree shape (modulo regenerated ids)", () => {
      const parsed = parseEntry(checklistToMarkdown(nested));
      expect(parsed?.kind).toBe("checklist");
      if (parsed?.kind !== "checklist") return;
      const items = parsed.checklist.items;
      expect(items.map((it) => it.title)).toEqual(["Parent", "Standalone"]);
      const kids = items[0]!.children!;
      expect(kids.map((it) => it.title)).toEqual(["Child A", "Child B"]);
      expect(kids[0]!.checked).toBe(true);
      expect(kids[1]!.notes).toBe("with a note");
      expect(kids[1]!.children!.map((it) => it.title)).toEqual(["Grandchild"]);
    });

    it("imports a pasted nested list as nested items", () => {
      const items = parseItemsFromMarkdown(
        "- [ ] Top\n  - [x] Sub one\n  - [ ] Sub two\n    - [ ] Deep\n",
      );
      expect(items).toEqual([
        {
          title: "Top",
          checked: false,
          required: false,
          children: [
            { title: "Sub one", checked: true, required: false },
            {
              title: "Sub two",
              checked: false,
              required: false,
              children: [{ title: "Deep", checked: false, required: false }],
            },
          ],
        },
      ]);
    });
  });

  describe("parseItemsFromMarkdown", () => {
    it("returns no items for ordinary, non-list text", () => {
      expect(parseItemsFromMarkdown("just a plain note")).toEqual([]);
      expect(parseItemsFromMarkdown("")).toEqual([]);
    });

    it("imports task lines, preserving checked state", () => {
      const items = parseItemsFromMarkdown(
        "# Groceries\n\n- [ ] Milk\n- [x] Bread\n",
      );
      expect(items).toEqual([
        { title: "Milk", checked: false, required: false },
        { title: "Bread", checked: true, required: false },
      ]);
    });

    it("imports a single bullet line (one or many)", () => {
      expect(parseItemsFromMarkdown("- Eggs")).toEqual([
        { title: "Eggs", checked: false, required: false },
      ]);
    });

    it("keeps the required marker and indented notes", () => {
      const items = parseItemsFromMarkdown(
        "- [x] Passport *(required)*\n  Check expiry",
      );
      expect(items).toEqual([
        {
          title: "Passport",
          checked: true,
          required: true,
          notes: "Check expiry",
        },
      ]);
    });

    it("ignores frontmatter and the archived heading, flattening to items", () => {
      const items = parseItemsFromMarkdown(
        "---\ntype: checklist\nid: x\n---\n# T\n\n- [ ] Active\n\n## Archived\n\n- [x] Old",
      );
      expect(items.map((i) => i.title)).toEqual(["Active", "Old"]);
    });

    it("round-trips the body produced by checklistBodyMarkdown", () => {
      const items = parseItemsFromMarkdown(checklistBodyMarkdown(checklist));
      expect(
        items.map((i) => ({ title: i.title, checked: i.checked })),
      ).toEqual([
        { title: "Milk", checked: false },
        { title: "Bread", checked: true },
        { title: "Eggs", checked: true },
        { title: "Old thing", checked: true },
      ]);
    });
  });
});
