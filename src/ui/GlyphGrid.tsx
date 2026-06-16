import { CloseIcon } from "./icons.tsx";
import { NamespaceGlyph } from "./NamespaceGlyph.tsx";

// A grid of glyph buttons — the "pick an icon" surface for a namespace.
// The leading cell clears the icon (back to the default favicon); the rest
// are the named glyphs from `NAMESPACE_GLYPH_NAMES`. Presentational: the
// caller owns the selected value and the tint colour. Ported from budget's
// `GlyphGrid`, trimmed to the checklist's needs (no roving-tabindex hook).

type Props = {
  glyphs: readonly string[];
  /** The selected glyph, or null when none is chosen (the clear cell). */
  value: string | null;
  /** Pick a glyph, or null to clear back to the default. */
  onChange: (glyph: string | null) => void;
  /** Tints the selected cell — the namespace's accent colour, when set. */
  tintColor?: string | null;
  /** aria-label for the leading "no icon" cell. */
  noneLabel: string;
  /** Per-glyph aria-label prefix, e.g. "Icon" → "Icon home". */
  ariaLabelPrefix: string;
};

export function GlyphGrid({
  glyphs,
  value,
  onChange,
  tintColor,
  noneLabel,
  ariaLabelPrefix,
}: Props) {
  const tintStyle = (selected: boolean) =>
    selected && tintColor ? { color: tintColor } : undefined;
  return (
    <div role="radiogroup" className="grid grid-cols-8 gap-1">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        aria-label={noneLabel}
        title={noneLabel}
        onClick={() => onChange(null)}
        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border ${
          value === null
            ? "border-accent text-accent"
            : "border-line text-muted hover:border-fg"
        }`}
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
      {glyphs.map((name) => {
        const selected = name === value;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${ariaLabelPrefix} ${name}`}
            onClick={() => onChange(name)}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded border ${
              selected && tintColor
                ? "border-current"
                : selected
                  ? "border-accent text-accent"
                  : "border-line text-muted hover:border-fg"
            }`}
            style={tintStyle(selected)}
          >
            <NamespaceGlyph name={name} className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
