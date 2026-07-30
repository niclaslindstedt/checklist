import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../../src/storage/migrations.ts";

describe("migrate", () => {
  it("upgrades a pre-versioning document (no version field) to the latest", () => {
    const result = migrate({ templates: [], checklists: [] });
    expect(result.migrated).toBe(true);
    expect(result.data.version).toBe(LATEST_VERSION);
  });

  it("treats a present-but-current document as not migrated", () => {
    const result = migrate({
      version: LATEST_VERSION,
      templates: [],
      checklists: [],
    });
    expect(result.migrated).toBe(false);
    expect(result.data.version).toBe(LATEST_VERSION);
  });

  it("guarantees both top-level arrays when bootstrapping a legacy doc", () => {
    const result = migrate({ version: 0 });
    expect(result.data.templates).toEqual([]);
    expect(result.data.checklists).toEqual([]);
  });

  it("preserves existing data through the chain", () => {
    const checklists = [{ id: "c1" }];
    const result = migrate({ checklists });
    expect(result.data.checklists).toBe(checklists);
  });

  it("throws when the document was written by a newer build", () => {
    expect(() => migrate({ version: LATEST_VERSION + 1 })).toThrow(
      /newer version/,
    );
  });

  it("coerces a non-object document to an empty version-0 doc", () => {
    const result = migrate("nonsense");
    expect(result.data.version).toBe(LATEST_VERSION);
    expect(result.data.templates).toEqual([]);
  });

  // v1 → v2: templates adopted the checklist item model, so their flat
  // `{ id, title, notes?, required? }` records need the `checked` flag every
  // checklist item carries. Nothing else about them changes.
  describe("v1 → v2 (templates adopt the checklist item model)", () => {
    it("stamps checked: false onto every v1 template item", () => {
      const result = migrate({
        version: 1,
        templates: [
          {
            version: 1,
            id: "t1",
            name: "Trip",
            items: [
              { id: "a", title: "Passport", required: true },
              { id: "b", title: "Charger", notes: "USB-C" },
            ],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        checklists: [],
      });

      expect(result.migrated).toBe(true);
      const items = (
        result.data.templates as { items: Record<string, unknown>[] }[]
      )[0]!.items;
      expect(items.every((i) => i.checked === false)).toBe(true);
      // Everything the old record carried survives untouched.
      expect(items[0]!.required).toBe(true);
      expect(items[1]!.notes).toBe("USB-C");
      expect(items.map((i) => i.title)).toEqual(["Passport", "Charger"]);
    });

    it("recurses into children a hand-edited document may already carry", () => {
      const result = migrate({
        version: 1,
        templates: [
          {
            id: "t1",
            name: "Trip",
            items: [
              {
                id: "a",
                title: "Documents",
                children: [{ id: "b", title: "ID" }],
              },
            ],
          },
        ],
        checklists: [],
      });

      const [parent] = (
        result.data.templates as {
          items: { checked: boolean; children?: { checked: boolean }[] }[];
        }[]
      )[0]!.items;
      expect(parent!.checked).toBe(false);
      expect(parent!.children?.[0]?.checked).toBe(false);
    });

    it("leaves checklists alone", () => {
      const checklists = [{ id: "c1", items: [{ id: "a", checked: true }] }];
      const result = migrate({ version: 1, templates: [], checklists });
      expect(result.data.checklists).toBe(checklists);
    });

    it("tolerates a malformed template entry rather than failing the load", () => {
      const result = migrate({
        version: 1,
        templates: ["nonsense", { id: "t1", name: "No items" }],
        checklists: [],
      });
      expect(result.data.version).toBe(LATEST_VERSION);
      expect(result.data.templates).toHaveLength(2);
    });
  });
});
