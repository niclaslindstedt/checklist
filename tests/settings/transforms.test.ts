import { describe, expect, it } from "vitest";

import { defaultSettings, validateSettings } from "../../src/settings/store.ts";

// The transform rules ride in the synced `Settings`, keyed by namespace, so
// the store's validator has to coerce whatever it finds into a usable map
// rather than throwing on a hand-edited or older blob.

// The rules the validator kept for one namespace.
function rulesFor(raw: unknown, slug = "work") {
  return validateSettings({ transforms: raw }).transforms[slug] ?? [];
}

describe("settings store — transforms", () => {
  it("defaults to no rules in any namespace", () => {
    expect(defaultSettings().transforms).toEqual({});
  });

  it("keeps a well-formed rule verbatim, under its namespace", () => {
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
    expect(
      validateSettings({ transforms: { work: [rule] } }).transforms,
    ).toEqual({ work: [rule] });
  });

  it("keeps each namespace's rules apart", () => {
    const out = validateSettings({
      transforms: {
        work: [{ id: "a", pattern: "#(\\d+)" }],
        home: [{ id: "b", pattern: "milk" }],
      },
    }).transforms;
    expect(Object.keys(out).sort()).toEqual(["home", "work"]);
    expect(out.work?.map((r) => r.id)).toEqual(["a"]);
    expect(out.home?.map((r) => r.id)).toEqual(["b"]);
  });

  it("moves a pre-namespace flat list into the default namespace", () => {
    const out = validateSettings({
      transforms: [{ id: "a", pattern: "#(\\d+)" }],
    }).transforms;
    expect(Object.keys(out)).toEqual(["default"]);
    expect(out.default?.map((r) => r.id)).toEqual(["a"]);
  });

  it("fills in the defaults for missing fields", () => {
    const [rule] = rulesFor({ work: [{ id: "a", pattern: "x" }] });
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
    const [rule] = rulesFor({
      work: [{ id: "a", pattern: "x", kind: "explode", mask: "shred" }],
    });
    expect(rule?.kind).toBe("link");
    expect(rule?.mask).toBe("edges");
  });

  it("drops entries with no id or no pattern, and duplicate ids", () => {
    const out = rulesFor({
      work: [
        { id: "a", pattern: "x" },
        { id: "", pattern: "y" },
        { id: "b" },
        { pattern: "z" },
        { id: "a", pattern: "second" },
        "nope",
      ],
    });
    expect(out.map((r) => r.id)).toEqual(["a"]);
    expect(out[0]?.pattern).toBe("x");
  });

  it("keeps a rule whose pattern doesn't compile, so a typo isn't destructive", () => {
    expect(
      rulesFor({ work: [{ id: "a", pattern: "(unclosed" }] }),
    ).toHaveLength(1);
  });

  it("falls back to no rules for a malformed shape", () => {
    expect(validateSettings({ transforms: "x" }).transforms).toEqual({});
    expect(validateSettings({ transforms: { work: "x" } }).transforms).toEqual(
      {},
    );
  });

  it("drops a namespace whose rules all failed validation, and a blank slug", () => {
    const out = validateSettings({
      transforms: {
        work: [{ id: "", pattern: "x" }],
        "": [{ id: "a", pattern: "x" }],
      },
    }).transforms;
    expect(out).toEqual({});
  });

  it("caps a runaway list per namespace", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      id: `r${i}`,
      pattern: "x",
    }));
    expect(rulesFor({ work: many, home: many })).toHaveLength(200);
  });
});
