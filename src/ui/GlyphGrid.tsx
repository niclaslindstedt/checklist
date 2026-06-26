import { NamespaceGlyph } from "./NamespaceGlyph.tsx";

// A grid of glyph buttons — the "pick an icon" surface for a namespace or a
// checklist. The leading cell clears any custom icon back to the default
// glyph (picking it is "no custom icon", which the app draws as `noneGlyph` —
// the folder for a namespace, the checklist mark for a list); the rest are
// the named glyphs the caller passes. Presentational: the caller owns the
// selected value and the tint colour. Ported from budget's `GlyphGrid`,
// trimmed to the checklist's needs (no roving-tabindex hook).

type Props = {
  glyphs: readonly string[];
  /** The selected glyph, or null when none is chosen (the clear cell). */
  value: string | null;
  /** Pick a glyph, or null to clear back to the default. */
  onChange: (glyph: string | null) => void;
  /** Tints the selected cell — the accent colour, when set. */
  tintColor?: string | null;
  /** aria-label for the leading "no icon" cell. */
  noneLabel: string;
  /** Per-glyph aria-label prefix, e.g. "Icon" → "Icon home". */
  ariaLabelPrefix: string;
  /** The glyph drawn in the leading "default" cell. */
  noneGlyph: string;
};

export function GlyphGrid({
  glyphs,
  value,
  onChange,
  tintColor,
  noneLabel,
  ariaLabelPrefix,
  noneGlyph,
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
          value === null && tintColor
            ? "border-current"
            : value === null
              ? "border-accent text-accent"
              : "border-line text-muted hover:border-fg"
        }`}
        style={tintStyle(value === null)}
      >
        <NamespaceGlyph name={noneGlyph} className="h-3.5 w-3.5" />
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
