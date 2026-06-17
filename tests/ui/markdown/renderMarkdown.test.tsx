import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  renderInlineMarkdown,
  renderMarkdown,
} from "../../../src/ui/markdown/renderMarkdown.tsx";

// The renderer returns React nodes; flatten them to a static HTML string so
// the assertions can read the structure it produced.
function html(source: string): string {
  return renderToStaticMarkup(<>{renderMarkdown(source)}</>);
}

describe("renderMarkdown", () => {
  it("renders inline emphasis, bold, code, and strikethrough", () => {
    const out = html("plain *em* **bold** `code` ~~gone~~");
    expect(out).toContain("<em>em</em>");
    expect(out).toContain("bold</strong>");
    expect(out).toContain("code</code>");
    expect(out).toContain("<del>gone</del>");
  });

  it("does not split a bold span into nested emphasis", () => {
    const out = html("**bold**");
    expect(out).toContain("bold</strong>");
    expect(out).not.toContain("<em>");
  });

  it("leaves underscores inside a word alone", () => {
    expect(html("snake_case_name")).toContain("snake_case_name");
    expect(html("snake_case_name")).not.toContain("<em>");
  });

  it("renders a safe link as an anchor and neutralises an unsafe one", () => {
    const safe = html("[docs](https://example.com)");
    expect(safe).toContain('href="https://example.com"');
    expect(safe).toContain(">docs</a>");

    const unsafe = html("[x](javascript:alert(1))");
    expect(unsafe).not.toContain("<a");
    expect(unsafe).toContain("[x](javascript:alert(1))");
  });

  it("never emits raw HTML the user typed", () => {
    const out = html("<img src=x onerror=alert(1)>");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("renders headings, demoted two levels and capped at h6", () => {
    expect(html("# Title")).toContain("<h3");
    expect(html("###### Deep")).toContain("<h6");
  });

  it("renders unordered and ordered lists", () => {
    const ul = html("- one\n- two");
    expect(ul).toContain("<ul");
    expect((ul.match(/<li/g) ?? []).length).toBe(2);

    const ol = html("1. first\n2. second");
    expect(ol).toContain("<ol");
  });

  it("renders blockquotes and fenced code blocks", () => {
    expect(html("> quoted")).toContain("<blockquote");
    const code = html("```\nconst x = 1;\n```");
    expect(code).toContain("<pre");
    expect(code).toContain("const x = 1;");
  });

  it("treats a single newline inside a paragraph as a soft break", () => {
    const out = html("line one\nline two");
    expect(out).toContain("<br");
  });

  it("renders an empty body as nothing", () => {
    expect(html("")).toBe("");
  });
});

describe("renderInlineMarkdown", () => {
  const inline = (source: string): string =>
    renderToStaticMarkup(<>{renderInlineMarkdown(source)}</>);

  it("renders bold and inline code without a block wrapper", () => {
    const out = inline("**In-app dialogs** — open the `/preview/` slot");
    expect(out).toContain("In-app dialogs</strong>");
    expect(out).toContain("/preview/</code>");
    expect(out).not.toContain("<p");
    expect(out).not.toContain("<li");
  });

  it("leaves plain text untouched and escapes raw HTML", () => {
    expect(inline("just text")).toBe("just text");
    expect(inline("<img src=x>")).toContain("&lt;img");
  });

  it("renders a feature: link as a plain anchor-free button only with a handler", () => {
    // Without a handler the `feature:` scheme isn't safe to navigate, so
    // the link renders as inert literal text.
    const inert = inline("[Learn more](feature:namespaces)");
    expect(inert).not.toContain("<a");
    expect(inert).not.toContain("<button");
    expect(inert).toContain("[Learn more](feature:namespaces)");

    // With a handler it becomes a button (no href to navigate away).
    const wired = renderToStaticMarkup(
      <>
        {renderInlineMarkdown("[Learn more](feature:namespaces)", {
          onOpenFeature: () => {},
        })}
      </>,
    );
    expect(wired).toContain("<button");
    expect(wired).toContain(">Learn more</button>");
    expect(wired).not.toContain("href");
  });
});
