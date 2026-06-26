import { useRef, useState } from "react";

import type { ChecklistAppearance } from "../domain/types.ts";
import { useT } from "../i18n";
import { ColorPalette } from "./ColorPalette.tsx";
import { FloatingPanel } from "./FloatingPanel.tsx";
import { GlyphGrid } from "./GlyphGrid.tsx";
import { CHECKLIST_GLYPH_NAMES, DEFAULT_CHECKLIST_GLYPH } from "./glyphs.ts";
import type { FloatingPlacement } from "./hooks/useFloatingPosition.ts";
import { NAMESPACE_COLORS } from "./namespace-colors.ts";
import { NamespaceGlyph } from "./NamespaceGlyph.tsx";

// The clickable list mark beside the checklist title. It draws the active
// list's chosen glyph (or the generic checklist mark when none is picked),
// tinted with the list's accent colour, and opens a small floating picker —
// the same Colour + Icon surface the namespace editor uses — so a tap on the
// mark re-skins the list in place. Presentational: the caller owns the
// appearance values and is handed each pick to persist.

// Anchored under the trigger, left edges aligned, fixed-width so the 8-column
// glyph grid never gets squeezed below a usable size. `viewport` space pairs
// with `position: fixed` the way the settings pickers do.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "max", maxPx: 288 },
  anchor: "left",
  gap: 6,
  coordinateSpace: "viewport",
};

type Props = {
  /** The list's chosen glyph, or null when it shows the default mark. */
  glyph: string | null;
  /** The list's chosen accent colour, or null when untinted. */
  color: string | null;
  /** Apply an appearance pick (a glyph or a colour) — set null to clear. */
  onChange: (patch: ChecklistAppearance) => void;
};

export function ChecklistGlyphButton({ glyph, color, onChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("app.changeListIcon")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-surface-2"
      >
        <NamespaceGlyph
          name={glyph ?? DEFAULT_CHECKLIST_GLYPH}
          className="h-5 w-5"
          style={color ? { color } : undefined}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={PLACEMENT}
        className="gap-3 p-3"
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t("app.listColorLabel")}
          </span>
          <ColorPalette
            colors={NAMESPACE_COLORS}
            value={color}
            onChange={(c) => onChange({ color: c })}
            ariaLabelPrefix={t("app.listColorLabel")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t("app.listGlyphLabel")}
          </span>
          <GlyphGrid
            glyphs={CHECKLIST_GLYPH_NAMES}
            value={glyph}
            onChange={(g) => onChange({ glyph: g })}
            tintColor={color}
            noneGlyph={DEFAULT_CHECKLIST_GLYPH}
            noneLabel={t("app.listGlyphNone")}
            ariaLabelPrefix={t("app.listGlyphLabel")}
          />
        </div>
      </FloatingPanel>
    </>
  );
}
