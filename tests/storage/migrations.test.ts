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
});
