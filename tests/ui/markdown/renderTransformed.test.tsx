// Imported straight from `preact-render-to-string` for the same reason as
// `renderMarkdown.test.tsx`: `preact/compat/server` ships no declarations.
import { renderToStaticMarkup } from "preact-render-to-string";
import { describe, expect, it } from "vitest";

import type { TransformRule } from "../../../src/domain/transforms.ts";
import { renderMarkdown } from "../../../src/ui/markdown/renderMarkdown.tsx";
import { renderTransformed } from "../../../src/ui/markdown/renderTransformed.tsx";

// Rendering the segments a display transform produces, both on its own (an
// item title) and threaded through the markdown renderer (an item note).

function rule(over: Partial<TransformRule> = {}): TransformRule {
  return {
    id: "r1",
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

const html = (node: unknown) => renderToStaticMarkup(<>{node as never}</>);

describe("renderTransformed", () => {
  it("returns the string untouched when no rule matches", () => {
    expect(renderTransformed("plain text", [rule()])).toBe("plain text");
    expect(renderTransformed("Fix #134", [])).toBe("Fix #134");
  });

  it("renders a matched reference as a new-tab anchor", () => {
    const out = html(renderTransformed("Fix #134", [rule()]));
    expect(out).toContain('href="https://example.com/issues/134"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain("#134</a>");
  });

  it("renders a masked run as inert text, never an input", () => {
    const out = html(
      renderTransformed("call 0761234123", [
        rule({ pattern: "\\d{10}", kind: "sensitive" }),
      ]),
    );
    expect(out).toContain("076****123");
    expect(out).not.toContain("0761234123");
  });

  it("renders a link as plain text when links must stay inert", () => {
    const out = html(
      renderTransformed("Fix #134", [rule()], { inertLinks: true }),
    );
    expect(out).not.toContain("<a");
    expect(out).toContain("#134");
  });
});

describe("renderMarkdown with transforms", () => {
  it("transforms the prose of a note", () => {
    const out = html(
      renderMarkdown("Fix #134 today", { transforms: [rule()] }),
    );
    expect(out).toContain('href="https://example.com/issues/134"');
  });

  it("leaves an existing link's target and label alone", () => {
    const out = html(
      renderMarkdown("[see #134](https://elsewhere.test/#134)", {
        transforms: [rule()],
      }),
    );
    expect(out).toContain('href="https://elsewhere.test/#134"');
    // The label is inside an anchor already, so no nested anchor is emitted.
    expect(out.match(/<a /g)).toHaveLength(1);
  });

  it("leaves code spans and fenced blocks alone", () => {
    const inline = html(
      renderMarkdown("`#134` is literal", { transforms: [rule()] }),
    );
    expect(inline).not.toContain("<a ");
    const fenced = html(
      renderMarkdown("```\n#134\n```", { transforms: [rule()] }),
    );
    expect(fenced).not.toContain("<a ");
  });

  it("masks a secret inside a note's prose", () => {
    const out = html(
      renderMarkdown("door code 0761234123", {
        transforms: [rule({ pattern: "\\d{10}", kind: "sensitive" })],
      }),
    );
    expect(out).toContain("076****123");
    expect(out).not.toContain("0761234123");
  });

  it("renders untransformed notes exactly as before", () => {
    const plain = html(renderMarkdown("**bold** and https://example.com"));
    const withRules = html(
      renderMarkdown("**bold** and https://example.com", {
        transforms: [rule()],
      }),
    );
    expect(withRules).toBe(plain);
  });
});
