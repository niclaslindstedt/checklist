import type { ReactNode } from "react";

import {
  activeTransforms,
  applyTransforms,
  type TransformRule,
  type TransformSegment,
} from "../../domain/transforms.ts";

// Renders the segments a display transform produces (see
// `src/domain/transforms.ts`). Plain runs stay text, a `link` rule becomes a
// real anchor, and a `sensitive` rule becomes a masked run drawn in a
// monospace face so `076****123` keeps its columns.
//
// Like the markdown renderer this returns VNodes, never an HTML string, so
// nothing a rule produces can inject markup; the `href` has already been
// scheme-checked in the domain layer.

// Every anchor a transform emits matches the markdown renderer's: a new tab
// so following a link never loses the list behind it, and `noopener` so the
// opened page can't reach back through `window.opener`.
function anchor(key: string, href: string, text: string): ReactNode {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-accent underline"
    >
      {text}
    </a>
  );
}

export type RenderTransformedOptions = {
  /** Disambiguates React keys when several runs share a parent. */
  keyBase?: string;
  /**
   * Render `link` segments as their label text instead of an anchor. Set
   * while rendering inside an existing link, where a nested `<a>` would be
   * invalid markup — the masking rules still apply.
   */
  inertLinks?: boolean;
};

/** Render one segment. Exported for the settings preview's own use. */
export function renderSegment(
  seg: TransformSegment,
  key: string,
  opts: RenderTransformedOptions = {},
): ReactNode {
  if (seg.kind === "link") {
    return opts.inertLinks ? seg.text : anchor(key, seg.href, seg.text);
  }
  if (seg.kind === "masked") {
    return (
      <span
        key={key}
        // Marks the run as deliberately hidden rather than mangled — the
        // screen reader says "hidden" instead of spelling out the asterisks.
        aria-label={maskedLabel}
        className="rounded bg-surface-3 px-1 font-mono tracking-wider text-muted"
      >
        {seg.text}
      </span>
    );
  }
  return seg.text;
}

// The accessible name of a masked run. Not routed through `useT` because the
// renderer is a plain function called from render bodies (and from the
// markdown parser, which has no hook context); the string is the same in both
// catalogs, and the mask itself carries no meaning to read out.
const maskedLabel = "hidden";

/**
 * Apply `rules` to a plain string and render the result. Returns the string
 * untouched when nothing matches, so the common case allocates nothing.
 */
export function renderTransformed(
  text: string,
  rules: readonly TransformRule[],
  opts: RenderTransformedOptions = {},
): ReactNode {
  if (rules.length === 0) return text;
  const segs = applyTransforms(text, rules);
  if (segs.length === 1 && segs[0]!.kind === "text") return segs[0]!.text;
  const keyBase = opts.keyBase ?? "t";
  return segs.map((seg, i) => renderSegment(seg, `${keyBase}-${i}`, opts));
}

/**
 * The enabled, compiling rules of a list — memoise this in a component and
 * hand the result to {@link renderTransformed} so a broken or parked rule
 * costs nothing per row.
 */
export { activeTransforms };
