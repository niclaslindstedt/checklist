import { useId, useMemo } from "react";

import { flattenForDisplay, isHeldBack } from "../domain/checklists.ts";
import type { Checklist, ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { Modal } from "./Modal.tsx";
import { NamespaceGlyph } from "./NamespaceGlyph.tsx";
import { Checkbox } from "./form/Checkbox.tsx";
import { DEFAULT_CHECKLIST_GLYPH } from "./glyphs.ts";
import { ChecklistIcon, CloseIcon } from "./icons.tsx";

// The "fresh start" pop-up: a checklist that has just been reset on its
// schedule (with "Pop up after refresh" ticked), shown as a card hovering over
// whatever list is on screen the next time the app opens — so the routine the
// schedule exists for is in front of the user without a trip through the
// sidebar. The card is a working list, not a notice: its boxes tick through
// `onToggle` (the same edit path the widgets use, so it works for a list
// other than the active one), and the X in the top-right corner — or the
// backdrop, or Escape — dismisses it. "Open list" jumps to the list itself.

const NO_COLLAPSE: ReadonlySet<string> = new Set();

type Props = {
  list: Checklist;
  /** The list's visible items, already in display order. */
  items: readonly ChecklistItem[];
  /** The "now" instant — decides which held-back boxes stay inert. */
  now: string;
  onToggle: (itemId: string) => void;
  onOpen: () => void;
  onClose: () => void;
};

export function ResetPopupModal({
  list,
  items,
  now,
  onToggle,
  onOpen,
  onClose,
}: Props) {
  const t = useT();
  const headingId = useId();
  const rows = useMemo(() => flattenForDisplay(items, NO_COLLAPSE), [items]);
  const customised = Boolean(list.glyph || list.color);

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy={headingId}
      centered
      size="max-w-md"
    >
      <div className="flex min-h-0 flex-col">
        <header className="flex items-start gap-3 border-b border-line px-5 pt-5 pb-3">
          <span className="mt-0.5 shrink-0 text-accent">
            {customised ? (
              <NamespaceGlyph
                name={list.glyph ?? DEFAULT_CHECKLIST_GLYPH}
                className="h-5 w-5"
                style={list.color ? { color: list.color } : undefined}
              />
            ) : (
              <ChecklistIcon className="h-5 w-5" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2
              id={headingId}
              className="truncate text-base font-semibold text-fg-bright"
            >
              {list.name}
            </h2>
            <p className="text-xs text-muted">
              {t("app.resetSchedule.popupHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mt-1 -mr-2 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">
              {t("app.resetSchedule.popupEmpty")}
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {rows.map(({ item, depth }) => {
                const held = isHeldBack(item, now);
                return (
                  <li
                    key={item.id}
                    style={{ paddingLeft: `${depth * 1.25}rem` }}
                    className="flex items-center gap-3 px-2 py-[var(--density-row-py)]"
                  >
                    <Checkbox
                      checked={item.checked}
                      onChange={() => onToggle(item.id)}
                      ariaLabel={
                        item.checked ? t("app.uncheck") : t("app.check")
                      }
                      disabled={held}
                      size={depth > 0 ? "sm" : "md"}
                    />
                    <span
                      className={
                        item.category
                          ? "text-xs font-semibold tracking-wide text-muted uppercase"
                          : item.checked
                            ? "text-sm text-muted line-through"
                            : "text-sm text-fg"
                      }
                    >
                      {item.title}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onOpen}
            className="rounded border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2"
          >
            {t("app.resetSchedule.openList")}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
