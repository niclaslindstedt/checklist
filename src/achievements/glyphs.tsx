// Inline SVG glyph set for the achievements feature. The budget project
// pulls one `LucideIcon` per achievement from `lucide-react`; the checklist
// stays dependency-free (see `src/ui/icons.tsx`) and inlines the handful it
// needs here, traced from Lucide's 24×24 grid so they share its weight.
//
// Kept in the achievements folder rather than `src/ui/icons.tsx` so the
// catalog reads from one self-contained place — adding an achievement that
// needs a fresh glyph touches only this file and the catalog. Reused chrome
// icons (plus / check / pencil / …) are re-exported from `icons.tsx` so the
// catalog has a single glyph import.

import type { ReactNode } from "react";

import {
  ArchiveIcon,
  CheckIcon,
  ClockIcon,
  CodeIcon,
  CopyIcon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
  SparklesIcon,
  TrashIcon,
  UndoIcon,
} from "../ui/icons.tsx";

// Every glyph is a function component taking an optional `className`, so a
// caller controls size and colour through Tailwind utilities (the strokes
// paint with `currentColor`). Matches `src/ui/icons.tsx`'s `IconProps`.
export type Glyph = (props: { className?: string }) => ReactNode;

type IconProps = { className?: string };

// Shared 24×24 stroked-icon frame so each glyph below is just its paths.
function Svg({
  className,
  children,
  fill = "none",
}: IconProps & { children: ReactNode; fill?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      {children}
    </svg>
  );
}

// ── Chrome glyphs (trophy button, tier headers, locked rows) ──────────────

export function TrophyGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </Svg>
  );
}

export function StarGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11.5 2.5 14 8l6 .5-4.5 4 1.5 6-5.5-3.2L6.5 18.5 8 12.5 3.5 8.5 9.5 8z" />
    </Svg>
  );
}

export function LockGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

// ── Tier glyphs ───────────────────────────────────────────────────────────

export function SproutGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 20h10" />
      <path d="M12 20c0-6 0-8 0-10" />
      <path d="M12 10C12 6 9 4 5 4c0 4 3 6 7 6Z" />
      <path d="M12 10c0-3 2-5 6-5 0 3-2 5-6 5Z" />
    </Svg>
  );
}

export function CompassGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </Svg>
  );
}

export function WorkflowGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M7 10v4a2 2 0 0 0 2 2h5" />
    </Svg>
  );
}

export function WandGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m4 20 12-12" />
      <path d="m15 5 1.5 1.5" />
      <path d="M18 3v3M20.5 4.5H17.5" />
      <path d="M19 13v3M20.5 14.5H17.5" />
      <path d="M9 4v2M10 5H8" />
    </Svg>
  );
}

// ── Per-achievement glyphs ─────────────────────────────────────────────────

export function NoteGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 3h9l5 5v13a0 0 0 0 1 0 0H5z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h7M8 17h5" />
    </Svg>
  );
}

export function AsteriskGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14" />
      <path d="M5 8.5 19 15.5" />
      <path d="M19 8.5 5 15.5" />
    </Svg>
  );
}

export function PaletteGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function TypeGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 6V5h16v1" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </Svg>
  );
}

export function ScaleTextGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 17 7 7l4 10" />
      <path d="M4.5 14h5" />
      <path d="M15 19v-7M15 12l3-3 3 3" />
    </Svg>
  );
}

export function SmartphoneGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </Svg>
  );
}

export function WidgetGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Svg>
  );
}

export function LayersGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </Svg>
  );
}

export function ArrowUpDownGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m8 4-3 3 3 3M5 7h6" />
      <path d="m16 20 3-3-3-3M19 17h-6" />
    </Svg>
  );
}

export function MoveGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3v18M5 10l-2 2 2 2M19 10l2 2-2 2M10 5l2-2 2 2M10 19l2 2 2-2" />
      <path d="M3 12h18" />
    </Svg>
  );
}

/** Two chevrons folding toward the centre — collapsing the footer away. */
export function ChevronsDownUpGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m7 20 5-5 5 5" />
      <path d="m7 4 5 5 5-5" />
    </Svg>
  );
}

/** A container with an arrow filing into it — moving a list to another space. */
export function FolderInputGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2" />
      <path d="M2 13h10" />
      <path d="m9 16 3-3-3-3" />
    </Svg>
  );
}

/** A folder with an arrow leaving it — relocating a whole folder elsewhere. */
export function FolderMoveGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v3" />
      <path d="M14 17h7" />
      <path d="m18 14 3 3-3 3" />
    </Svg>
  );
}

export function PasteGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </Svg>
  );
}

export function BoxesGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  );
}

export function CloudGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24" />
    </Svg>
  );
}

// Traced from Lucide's `apple` — the iCloud (Apple key-value sync) trophy.
export function AppleGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
      <path d="M10 2c1 .5 2 2 2 5" />
    </Svg>
  );
}

/** A struck-through cloud — working offline against the local copy. */
export function CloudOffGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m2 2 20 20" />
      <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
      <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
    </Svg>
  );
}

export function RefreshGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </Svg>
  );
}

/** A cloud with a magnifier — inspecting the cloud-sync status. */
export function CloudSearchGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.5 3.5a7 7 0 0 0-6.5 11.4" />
      <path d="M17.5 8h-1.79A7 7 0 0 0 13 4.07" />
      <circle cx="15" cy="16" r="3.5" />
      <path d="m18 19 2.5 2.5" />
    </Svg>
  );
}

export function SearchGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  );
}

export function SaveGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v5h7V3" />
      <rect x="8" y="13" width="8" height="5" />
    </Svg>
  );
}

export function MergeGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="7" cy="5" r="2" />
      <circle cx="7" cy="19" r="2" />
      <path d="M7 7v10" />
      <path d="M7 11h6a4 4 0 0 0 4-4V6" />
      <path d="M14 9l3-3 3 3" />
    </Svg>
  );
}

export function BellOffGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8.7 5A4 4 0 0 1 16 8v3" />
      <path d="M6 8v3c0 2-1 4-2 5h12" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
      <path d="m3 3 18 18" />
    </Svg>
  );
}

export function AccessibilityGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="5" r="1.5" />
      <path d="M5 8h14" />
      <path d="M12 7v6" />
      <path d="m9 21 3-7 3 7" />
    </Svg>
  );
}

export function EyeOffGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.7 5.1A11 11 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.2 3.1" />
      <path d="M6.3 6.3A13 13 0 0 0 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </Svg>
  );
}

export function FlaskGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 18l-5-9V3" />
      <path d="M7.5 14h9" />
    </Svg>
  );
}

export function GlobeGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18Z" />
    </Svg>
  );
}

export function MedalGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 3 6 8M16 3l2 5" />
      <path d="M9 3h6l-2.5 6h-1z" />
      <circle cx="12" cy="15" r="6" />
      <path d="M12 12.5 13 14.5 15 14.7 13.5 16 14 18 12 17 10 18 10.5 16 9 14.7 11 14.5z" />
    </Svg>
  );
}

export function HashGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 4 7 20M17 4l-2 16" />
      <path d="M5 9h15M4 15h15" />
    </Svg>
  );
}

/** Lucide `lightbulb` — a suggestion offered while typing. */
export function LightbulbGlyph({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </Svg>
  );
}

// Re-exports of the chrome icons reused as achievement glyphs, normalised to
// the `Glyph` signature so the catalog imports every glyph from one module.
export const PlusGlyph: Glyph = PlusIcon;
export const CheckGlyph: Glyph = CheckIcon;
export const PencilGlyph: Glyph = PencilIcon;
export const ArchiveGlyph: Glyph = ArchiveIcon;
export const RestoreGlyph: Glyph = RestoreIcon;
export const UndoGlyph: Glyph = UndoIcon;
export const CopyGlyph: Glyph = CopyIcon;
export const FolderGlyph: Glyph = FolderIcon;
export const TrashGlyph: Glyph = TrashIcon;
export const ClockGlyph: Glyph = ClockIcon;
export const CodeGlyph: Glyph = CodeIcon;
export const SparklesGlyph: Glyph = SparklesIcon;
