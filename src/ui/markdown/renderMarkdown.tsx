import { createElement, type ReactNode } from "react";

// A tiny, dependency-free markdown renderer for checklist item bodies.
//
// The app stays dependency-light (it inlines its icons rather than pull in
// lucide-react), so it renders the small markdown subset an item note needs
// itself instead of adding a `marked` / `react-markdown` dependency. It
// returns React nodes — never a raw HTML string fed to
// `dangerouslySetInnerHTML` — so it is XSS-safe by construction: any markup
// a user types lands as literal text, and link targets are scheme-checked
// before they become an `href`.
//
// Supported: headings (`#`…`######`), unordered (`-` / `*` / `+`) and
// ordered (`1.`) lists, blockquotes (`>`), fenced code blocks (```), and
// inline **bold**, *italic*, `code`, ~~strikethrough~~, and [links](url).
// Anything outside that grammar renders as plain text — which is exactly
// what the edit mode shows, so the raw and rendered forms stay legible.

// Link targets we are willing to turn into a real anchor. Anything else
// (notably `javascript:` / `data:`) renders as inert literal text.
const URL_SAFE = /^(https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return URL_SAFE.test(trimmed) ? trimmed : null;
}

type InlineRule = {
  re: RegExp;
  make: (m: RegExpExecArray, key: string) => ReactNode;
};

// Ordered by precedence for ties at the same start index: code first (its
// content is literal), then links, then bold before italic so `**x**`
// never decomposes into nested emphasis.
const INLINE_RULES: InlineRule[] = [
  {
    re: /`([^`]+)`/,
    make: (m, key) => (
      <code
        key={key}
        className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]"
      >
        {m[1]}
      </code>
    ),
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    make: (m, key) => {
      const href = safeHref(m[2]!);
      if (!href) return m[0];
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-accent underline"
        >
          {parseInline(m[1]!, key)}
        </a>
      );
    },
  },
  {
    re: /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__/,
    make: (m, key) => (
      <strong key={key} className="font-semibold text-fg">
        {parseInline(m[1] ?? m[2] ?? "", key)}
      </strong>
    ),
  },
  {
    re: /~~([\s\S]+?)~~/,
    make: (m, key) => <del key={key}>{parseInline(m[1]!, key)}</del>,
  },
  {
    re: /\*([^*\n]+?)\*|(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/,
    make: (m, key) => <em key={key}>{parseInline(m[1] ?? m[2] ?? "", key)}</em>,
  },
];

// Turn a run of text into nodes, peeling off the earliest-starting inline
// token at each step and recursing into its content (except `code`, which
// is literal). Plain runs fall through as text nodes.
function parseInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let counter = 0;

  while (rest.length > 0) {
    let bestIdx = -1;
    let bestRule: InlineRule | null = null;
    let bestMatch: RegExpExecArray | null = null;
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest);
      if (m && (bestIdx === -1 || m.index < bestIdx)) {
        bestIdx = m.index;
        bestRule = rule;
        bestMatch = m;
      }
    }
    if (!bestRule || !bestMatch) {
      out.push(rest);
      break;
    }
    if (bestIdx > 0) out.push(rest.slice(0, bestIdx));
    out.push(bestRule.make(bestMatch, `${keyBase}-${counter++}`));
    rest = rest.slice(bestIdx + bestMatch[0].length);
  }
  return out;
}

const BLANK = /^\s*$/;
const FENCE = /^```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^\s*>\s?/;
const UL = /^\s*[-*+]\s+/;
const OL = /^\s*\d+\.\s+/;

function isSpecial(line: string): boolean {
  return (
    BLANK.test(line) ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    UL.test(line) ||
    OL.test(line)
  );
}

/**
 * Render a markdown string as React nodes. Returns an array of block
 * elements (headings, lists, paragraphs, …) the caller drops into a
 * container. Every branch consumes at least one line, so the walk always
 * terminates.
 */
export function renderMarkdown(source: string): ReactNode {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const nextKey = () => `b${n++}`;

  while (i < lines.length) {
    const line = lines[i]!;

    if (BLANK.test(line)) {
      i++;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i]!)) body.push(lines[i++]!);
      i++; // closing fence (or end of input)
      blocks.push(
        <pre
          key={nextKey()}
          className="overflow-x-auto rounded bg-surface-3 p-2 font-mono text-[0.85em]"
        >
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const key = nextKey();
      // Item bodies sit small, so push the level down two steps (an h1 in
      // the note renders as an h3) and cap at h6.
      const tag = `h${Math.min(heading[1]!.length + 2, 6)}`;
      blocks.push(
        createElement(
          tag,
          { key, className: "mt-2 mb-1 font-semibold text-fg" },
          parseInline(heading[2]!, key),
        ),
      );
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        quote.push(lines[i++]!.replace(QUOTE, ""));
      }
      blocks.push(
        <blockquote
          key={nextKey()}
          className="my-1 border-l-2 border-line pl-3 text-muted"
        >
          {renderMarkdown(quote.join("\n"))}
        </blockquote>,
      );
      continue;
    }

    if (UL.test(line)) {
      const key = nextKey();
      const items: ReactNode[] = [];
      while (i < lines.length && UL.test(lines[i]!)) {
        const content = lines[i]!.replace(UL, "");
        items.push(
          <li key={`${key}-${items.length}`}>
            {parseInline(content, `${key}-${items.length}`)}
          </li>,
        );
        i++;
      }
      blocks.push(
        <ul key={key} className="my-1 list-disc pl-5">
          {items}
        </ul>,
      );
      continue;
    }

    if (OL.test(line)) {
      const key = nextKey();
      const items: ReactNode[] = [];
      while (i < lines.length && OL.test(lines[i]!)) {
        const content = lines[i]!.replace(OL, "");
        items.push(
          <li key={`${key}-${items.length}`}>
            {parseInline(content, `${key}-${items.length}`)}
          </li>,
        );
        i++;
      }
      blocks.push(
        <ol key={key} className="my-1 list-decimal pl-5">
          {items}
        </ol>,
      );
      continue;
    }

    // Paragraph: gather consecutive plain lines, joined with soft breaks.
    const key = nextKey();
    const para: ReactNode[] = [];
    let row = 0;
    while (i < lines.length && !isSpecial(lines[i]!)) {
      if (row > 0) para.push(<br key={`${key}-br${row}`} />);
      para.push(...parseInline(lines[i]!, `${key}-${row}`));
      row++;
      i++;
    }
    blocks.push(
      <p key={key} className="my-1">
        {para}
      </p>,
    );
  }

  return blocks;
}
