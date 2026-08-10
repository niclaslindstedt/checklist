import { describe, expect, it } from "vitest";

import {
  activeTransforms,
  applyTransforms,
  compilePattern,
  expandTemplate,
  hasAnyTransforms,
  maskValue,
  namespaceTransforms,
  safeTransformHref,
  setNamespaceTransforms,
  transformRuleError,
  transformsMatch,
  type TransformRule,
} from "../../src/domain/transforms.ts";

// The display-transform engine: user-written regex rules that rewrite how an
// item reads without touching what it stores.

function rule(over: Partial<TransformRule> = {}): TransformRule {
  return {
    id: over.id ?? "r1",
    pattern: "#(\\d+)",
    caseInsensitive: false,
    kind: "link",
    replacement: "https://example.com/issues/$1",
    label: "",
    mask: "edges",
    enabled: true,
    ...over,
  };
}

describe("compilePattern", () => {
  it("compiles a pattern globally, and case-insensitively on request", () => {
    expect(compilePattern("a", false)?.flags).toBe("g");
    expect(compilePattern("a", true)?.flags).toBe("gi");
  });

  it("returns null for an empty or broken pattern", () => {
    expect(compilePattern("", false)).toBeNull();
    expect(compilePattern("(unclosed", false)).toBeNull();
  });

  it("caches by source and flags, so the same pattern is one object", () => {
    expect(compilePattern("cached", false)).toBe(
      compilePattern("cached", false),
    );
    expect(compilePattern("cached", false)).not.toBe(
      compilePattern("cached", true),
    );
  });
});

describe("transformRuleError", () => {
  it("names the two ways a rule can't be saved", () => {
    expect(transformRuleError("   ", false)).toBe("pattern-empty");
    expect(transformRuleError("[", false)).toBe("pattern-invalid");
    expect(transformRuleError("#(\\d+)", false)).toBeNull();
  });
});

describe("expandTemplate", () => {
  const match = (re: RegExp, s: string) => re.exec(s)!;

  it("substitutes numbered groups and the whole match", () => {
    const m = match(/(\w+)-(\w+)/, "foo-bar");
    expect(expandTemplate("$2/$1", m)).toBe("bar/foo");
    expect(expandTemplate("[$&]", m)).toBe("[foo-bar]");
  });

  it("substitutes named groups", () => {
    const m = match(/(?<year>\d{4})-(?<month>\d{2})/, "2026-08");
    expect(expandTemplate("$<month>.$<year>", m)).toBe("08.2026");
    expect(expandTemplate("$<nope>!", m)).toBe("!");
  });

  it("reads a two-digit group when that capture exists", () => {
    const m = match(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)/, "abcdefghijk");
    expect(expandTemplate("$11", m)).toBe("k");
    // With no eleventh group, `$11` is `$1` followed by a literal 1.
    const short = match(/(a)(b)/, "ab");
    expect(expandTemplate("$11", short)).toBe("a1");
  });

  it("keeps `$$` as a literal dollar and leaves unknown escapes alone", () => {
    const m = match(/x/, "x");
    expect(expandTemplate("$$5", m)).toBe("$5");
    expect(expandTemplate("cost: $", m)).toBe("cost: $");
    expect(expandTemplate("$z", m)).toBe("$z");
  });
});

describe("maskValue", () => {
  it("keeps the first and last three characters", () => {
    expect(maskValue("0761234123", "edges")).toBe("076****123");
  });

  it("masks entirely when there's nothing left to keep", () => {
    expect(maskValue("123456", "edges")).toBe("******");
    expect(maskValue("abcd", "last4")).toBe("****");
  });

  it("keeps the last four", () => {
    expect(maskValue("0761234123", "last4")).toBe("******4123");
  });

  it("hides everything at the original length, or at a fixed one", () => {
    expect(maskValue("secret", "full")).toBe("******");
    expect(maskValue("secret", "fixed")).toBe("*******");
    expect(maskValue("a much longer secret", "fixed")).toBe("*******");
  });

  it("counts astral characters once", () => {
    expect(maskValue("😀😀", "full")).toBe("**");
  });
});

describe("safeTransformHref", () => {
  it("accepts the schemes a link rule may open", () => {
    expect(safeTransformHref("https://example.com")).toBe(
      "https://example.com",
    );
    expect(safeTransformHref(" mailto:a@b.c ")).toBe("mailto:a@b.c");
    expect(safeTransformHref("/local/path")).toBe("/local/path");
  });

  it("refuses script and data URLs, and empty targets", () => {
    expect(safeTransformHref("javascript:alert(1)")).toBeNull();
    expect(safeTransformHref("data:text/html,x")).toBeNull();
    expect(safeTransformHref("   ")).toBeNull();
  });
});

describe("applyTransforms", () => {
  it("leaves an unmatched string as a single text segment", () => {
    expect(applyTransforms("nothing here", [rule()])).toEqual([
      { kind: "text", text: "nothing here" },
    ]);
  });

  it("turns a reference into a link, keeping the matched text as label", () => {
    expect(applyTransforms("Fix #134 today", [rule()])).toEqual([
      { kind: "text", text: "Fix " },
      {
        kind: "link",
        text: "#134",
        href: "https://example.com/issues/134",
      },
      { kind: "text", text: " today" },
    ]);
  });

  it("uses a label template when the rule has one", () => {
    const segs = applyTransforms("Fix #134", [rule({ label: "issue $1" })]);
    expect(segs[1]).toEqual({
      kind: "link",
      text: "issue 134",
      href: "https://example.com/issues/134",
    });
  });

  it("replaces every occurrence, not just the first", () => {
    const segs = applyTransforms("#1 and #2", [rule()]);
    expect(segs.filter((s) => s.kind === "link")).toHaveLength(2);
  });

  it("falls back to plain text when the rule builds an unsafe URL", () => {
    const segs = applyTransforms("Fix #134", [
      rule({ replacement: "javascript:alert($1)" }),
    ]);
    expect(segs).toEqual([{ kind: "text", text: "Fix #134" }]);
  });

  it("substitutes text replacements with capture groups", () => {
    const segs = applyTransforms("Fix #134 now", [
      rule({ kind: "text", replacement: "ticket $1" }),
    ]);
    expect(segs).toEqual([{ kind: "text", text: "Fix ticket 134 now" }]);
  });

  it("masks a sensitive match with the chosen style", () => {
    const segs = applyTransforms("Code 0761234123 for the door", [
      rule({ pattern: "\\d{10}", kind: "sensitive", mask: "edges" }),
    ]);
    expect(segs).toEqual([
      { kind: "text", text: "Code " },
      { kind: "masked", text: "076****123" },
      { kind: "text", text: " for the door" },
    ]);
  });

  it("honours the case-insensitive flag", () => {
    const insensitive = rule({
      pattern: "todo",
      kind: "text",
      replacement: "TODO",
      caseInsensitive: true,
    });
    expect(applyTransforms("ToDo later", [insensitive])).toEqual([
      { kind: "text", text: "TODO later" },
    ]);
    expect(
      applyTransforms("ToDo later", [
        { ...insensitive, caseInsensitive: false },
      ]),
    ).toEqual([{ kind: "text", text: "ToDo later" }]);
  });

  it("skips disabled rules and rules that don't compile", () => {
    expect(applyTransforms("Fix #134", [rule({ enabled: false })])).toEqual([
      { kind: "text", text: "Fix #134" },
    ]);
    expect(applyTransforms("Fix #134", [rule({ pattern: "(" })])).toEqual([
      { kind: "text", text: "Fix #134" },
    ]);
  });

  it("runs rules in order and leaves a claimed run alone", () => {
    const first = rule({ id: "a", kind: "text", replacement: "ISSUE-$1" });
    // Would rewrite the first rule's output if later rules re-scanned it.
    const second = rule({
      id: "b",
      pattern: "ISSUE",
      kind: "text",
      replacement: "BUG",
    });
    expect(applyTransforms("Fix #134", [first, second])).toEqual([
      { kind: "text", text: "Fix ISSUE-134" },
    ]);
  });

  it("lets a later rule work on the text an earlier one didn't touch", () => {
    const link = rule();
    const mask = rule({
      id: "b",
      pattern: "\\d{10}",
      kind: "sensitive",
      mask: "full",
    });
    const segs = applyTransforms("#7 call 0761234123", [link, mask]);
    expect(segs.map((s) => s.kind)).toEqual(["link", "text", "masked"]);
  });

  it("terminates on a pattern that can match nothing", () => {
    const segs = applyTransforms("abc", [
      rule({ pattern: "x*", kind: "text", replacement: "!" }),
    ]);
    expect(segs).toEqual([{ kind: "text", text: "abc" }]);
  });

  it("bounds how many matches one rule rewrites in one run", () => {
    const segs = applyTransforms("a".repeat(500), [
      rule({ pattern: "a", kind: "sensitive", mask: "fixed" }),
    ]);
    expect(segs.filter((s) => s.kind === "masked")).toHaveLength(200);
  });

  it("returns one empty text segment for an empty string", () => {
    expect(applyTransforms("", [rule()])).toEqual([{ kind: "text", text: "" }]);
  });
});

describe("activeTransforms / transformsMatch", () => {
  it("keeps only the enabled rules whose pattern compiles", () => {
    const rules = [
      rule({ id: "ok" }),
      rule({ id: "off", enabled: false }),
      rule({ id: "broken", pattern: "(" }),
    ];
    expect(activeTransforms(rules).map((r) => r.id)).toEqual(["ok"]);
  });

  it("reports whether anything on screen would change", () => {
    expect(transformsMatch("Fix #134", [rule()])).toBe(true);
    expect(transformsMatch("nothing", [rule()])).toBe(false);
  });
});

describe("namespace-scoped rules", () => {
  it("reads a namespace's rules, and nothing for one that has none", () => {
    const rules = { work: [rule({ id: "w" })] };
    expect(namespaceTransforms(rules, "work").map((r) => r.id)).toEqual(["w"]);
    expect(namespaceTransforms(rules, "home")).toEqual([]);
  });

  it("hands back the same empty list every time, so a memo stays stable", () => {
    expect(namespaceTransforms({}, "home")).toBe(
      namespaceTransforms({}, "work"),
    );
  });

  it("replaces one namespace's rules without touching the others", () => {
    const before = { work: [rule({ id: "w" })], home: [rule({ id: "h" })] };
    const after = setNamespaceTransforms(before, "work", [rule({ id: "w2" })]);
    expect(after.work?.map((r) => r.id)).toEqual(["w2"]);
    expect(after.home).toBe(before.home);
    // The input is left alone — the caller's copy is still what it was.
    expect(before.work?.map((r) => r.id)).toEqual(["w"]);
  });

  it("drops the namespace's entry once its last rule goes", () => {
    const after = setNamespaceTransforms({ work: [rule()] }, "work", []);
    expect(after).toEqual({});
  });

  it("knows whether any namespace has a rule at all", () => {
    expect(hasAnyTransforms({})).toBe(false);
    expect(hasAnyTransforms({ work: [] })).toBe(false);
    expect(hasAnyTransforms({ work: [], home: [rule()] })).toBe(true);
  });
});
