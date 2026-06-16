import { describe, expect, it } from "vitest";

import type { Checklist, Snapshot, Template } from "../../src/domain/types.ts";
import {
  checklistToMarkdown,
  entryFileStem,
  filesToSnapshot,
  parseEntry,
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
});
