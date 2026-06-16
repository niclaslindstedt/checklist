import { useEffect, useId, type ReactNode } from "react";

import { useT } from "../i18n";
import { DEFAULT_MENU_BUTTON_POSITION } from "../settings/store.ts";
import type { MenuButtonPosition } from "../settings/types.ts";
import { useDraggableMenuButton } from "./hooks/useDraggableMenuButton.ts";
import {
  ArchiveIcon,
  ChecklistIcon,
  MenuIcon,
  RedoIcon,
  UndoIcon,
} from "./icons.tsx";

// The navigation drawer. Collapsed to a single floating button the user
// can drag to either side edge (its resting spot persists in settings);
// pressing it slides the drawer in from that same side over a dimmed
// backdrop. The drawer lists the app's views (the active checklist and the
// archive) and highlights the current one. Selecting a view navigates and
// closes the drawer. Kept presentational — App owns the open/current state
// and the persisted position, mirroring how ChecklistView is wired.

/** The top-level views the drawer switches between. */
export type View = "checklist" | "archive";

type Props = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  current: View;
  onNavigate: (view: View) => void;
  /** Archived-item count, shown as a badge beside the Archive entry. */
  archivedCount: number;
  /** Revert the last edit. */
  onUndo: () => void;
  /** Re-apply the most recently undone edit. */
  onRedo: () => void;
  /** Whether there is a prior edit to revert. */
  canUndo: boolean;
  /** Whether there is an undone edit to re-apply. */
  canRedo: boolean;
  /** Where the floating button rests; defaults to the left edge. */
  position?: MenuButtonPosition;
  /** Persist a new resting spot after the user drags the button. */
  onPositionChange?: (next: MenuButtonPosition) => void;
};

export function SideMenu({
  open,
  onToggle,
  onClose,
  current,
  onNavigate,
  archivedCount,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  position = DEFAULT_MENU_BUTTON_POSITION,
  onPositionChange,
}: Props) {
  const t = useT();
  const drawerId = useId();
  const drag = useDraggableMenuButton(position, onPositionChange ?? (() => {}));

  // Dismiss on Escape while open (the backdrop handles pointer dismissal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onRight = position.side === "right";

  return (
    <>
      {/* Floating toggle the user can drag to either edge; a plain press
          still toggles the drawer (the drag hook swallows the click that
          tails a real drag, and leaves keyboard activation untouched). */}
      <button
        type="button"
        onClick={() => {
          if (drag.consumeDragClick()) return;
          onToggle();
        }}
        {...drag.handlers}
        style={drag.style}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? drawerId : undefined}
        aria-label={open ? t("nav.close") : t("nav.open")}
        className={`fixed z-40 flex h-11 w-11 touch-none items-center justify-center rounded-full border border-line bg-surface text-muted shadow-lg select-none hover:text-fg-bright ${
          drag.dragging
            ? "cursor-grabbing transition-none"
            : "cursor-grab transition-[left,top] duration-300 ease-out"
        }`}
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          className={`fixed inset-0 z-50 flex ${onRight ? "justify-end" : ""}`}
        >
          <button
            type="button"
            aria-label={t("nav.close")}
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <nav
            id={drawerId}
            aria-label={t("nav.label")}
            className={`relative flex w-64 max-w-[80%] flex-col bg-surface shadow-xl [padding-bottom:env(safe-area-inset-bottom)] [padding-top:env(safe-area-inset-top)] ${
              onRight ? "border-l border-line" : "border-r border-line"
            }`}
          >
            <p className="border-b border-line px-5 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
              {t("nav.label")}
            </p>
            <NavItem
              icon={<ChecklistIcon className="h-5 w-5" />}
              label={t("nav.checklist")}
              active={current === "checklist"}
              onClick={() => onNavigate("checklist")}
            />
            <NavItem
              icon={<ArchiveIcon className="h-5 w-5" />}
              label={t("nav.archive")}
              active={current === "archive"}
              badge={archivedCount > 0 ? archivedCount : undefined}
              onClick={() => onNavigate("archive")}
            />
            <p className="border-t border-line px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {t("nav.edit")}
            </p>
            {/* Undo / redo keep the drawer open so a burst of reverts can
                be applied without reopening it each time. */}
            <NavItem
              icon={<UndoIcon className="h-5 w-5" />}
              label={t("nav.undo")}
              active={false}
              disabled={!canUndo}
              onClick={onUndo}
            />
            <NavItem
              icon={<RedoIcon className="h-5 w-5" />}
              label={t("nav.redo")}
              active={false}
              disabled={!canRedo}
              onClick={onRedo}
            />
          </nav>
        </div>
      )}
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm ${
        disabled
          ? "cursor-not-allowed text-muted/50"
          : active
            ? "cursor-pointer bg-surface-2 font-semibold text-fg-bright"
            : "cursor-pointer text-fg hover:bg-surface-2 hover:text-fg-bright"
      }`}
    >
      <span
        className={
          disabled ? "text-muted/50" : active ? "text-accent" : "text-muted"
        }
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}
