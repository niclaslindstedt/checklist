import { describe, expect, it } from "vitest";

import { defaultSettings, validateSettings } from "../../src/settings/store.ts";

// The transform rules ride in the synced `Settings`, so the store's validator
// has to coerce whatever it finds into a usable list rather than throwing on a
// hand-edited or older blob.

describe("settings store — transforms", () => {
  it("defaults to no rules", () => {
    expect(defaultSettings().transforms).toEqual([]);
  });

  it("keeps a well-formed rule verbatim", () => {
    const rule = {
      id: "a",
      pattern: "#(\\d+)",
      caseInsensitive: true,
      kind: "link",
      replacement: "https://example.com/$1",
      label: "issue $1",
      mask: "full",
      enabled: false,
    };
    expect(validateSettings({ transforms: [rule] }).transforms).toEqual([rule]);
  });

  it("fills in the defaults for missing fields", () => {
    const [rule] = validateSettings({
      transforms: [{ id: "a", pattern: "x" }],
    }).transforms;
    expect(rule).toEqual({
      id: "a",
      pattern: "x",
      caseInsensitive: false,
      kind: "link",
      replacement: "",
      label: "",
      mask: "edges",
      enabled: true,
    });
  });

  it("coerces an unknown kind and mask back to the defaults", () => {
    const [rule] = validateSettings({
      transforms: [{ id: "a", pattern: "x", kind: "explode", mask: "shred" }],
    }).transforms;
    expect(rule?.kind).toBe("link");
    expect(rule?.mask).toBe("edges");
  });

  it("drops entries with no id or no pattern, and duplicate ids", () => {
    const out = validateSettings({
      transforms: [
        { id: "a", pattern: "x" },
        { id: "", pattern: "y" },
        { id: "b" },
        { pattern: "z" },
        { id: "a", pattern: "second" },
        "nope",
      ],
    }).transforms;
    expect(out.map((r) => r.id)).toEqual(["a"]);
    expect(out[0]?.pattern).toBe("x");
  });

  it("keeps a rule whose pattern doesn't compile, so a typo isn't destructive", () => {
    const out = validateSettings({
      transforms: [{ id: "a", pattern: "(unclosed" }],
    }).transforms;
    expect(out).toHaveLength(1);
  });

  it("falls back to an empty list for a malformed shape", () => {
    expect(validateSettings({ transforms: "x" }).transforms).toEqual([]);
  });

  it("caps a runaway list", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: `r${i}`,
      pattern: "x",
    }));
    expect(validateSettings({ transforms: many }).transforms).toHaveLength(200);
  });
});
