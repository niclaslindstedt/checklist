import type { ChecklistItem } from "../domain/types.ts";
import { INDENT_PER_LEVEL } from "./ChecklistRow.tsx";

// The "ghost" preview shown while dragging a row: a dashed, accent-tinted copy
// of the dragged item snapped into the exact spot it will land — indented one
// level when it's about to become a sub-item. It sits in the list flow (so the
// surrounding rows open a gap for it) while the real dragged row floats,
// shrunken, under the finger. Non-interactive: it's purely a landing marker.
//
// Its left columns mirror `ChecklistRow` exactly — the same `padding-left`
// indent calc, the fixed caret slot (`w-5`), and the `gap-3` — so the ghost's
// checkbox lines up with the rows around it (a sibling drop sits flush under
// the top-level parent, a nested drop one indent step in), rather than drifting
// left because it skipped the caret column.
export function DragGhostRow({
  item,
  depth,
}: {
  item: ChecklistItem;
  depth: number;
}) {
  const indent = depth * INDENT_PER_LEVEL;
  return (
    <li
      aria-hidden
      data-drag-ghost
      className="pointer-events-none border-b border-line bg-page-bg"
    >
      <div
        style={{
          paddingLeft: indent
            ? `calc(var(--density-row-px) + ${indent}px)`
            : undefined,
        }}
        className="flex min-h-11 items-center gap-3 rounded-md border-2 border-dashed border-accent bg-accent/10 px-[var(--density-row-px)] py-[var(--density-row-py)]"
      >
        {/* Caret slot — a fixed-width spacer mirroring the row's disclosure
            caret column, so the checkbox aligns under the rows above. */}
        <span className="w-5 shrink-0" />
        <span className="h-5 w-5 shrink-0 rounded border-2 border-accent/60" />
        <span className="min-w-0 flex-1 truncate text-left text-fg">
          {item.title}
        </span>
      </div>
    </li>
  );
}
