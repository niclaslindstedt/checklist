import { useEffect, useId, type ReactNode } from "react";

import { BUILD_LABEL } from "../build-env.ts";
import { useT } from "../i18n";
import { DEFAULT_MENU_BUTTON_POSITION } from "../settings/store.ts";
import type { MenuButtonPosition } from "../settings/types.ts";
import type { Namespace } from "../storage/namespaces.ts";
import { useDraggableMenuButton } from "./hooks/useDraggableMenuButton.ts";
import {
  ArchiveIcon,
  CheckIcon,
  ChecklistIcon,
  CodeIcon,
  CogIcon,
  FolderIcon,
  HeartIcon,
  MenuIcon,
  PlusIcon,
  RedoIcon,
  ShieldIcon,
  SparklesIcon,
  UndoIcon,
} from "./icons.tsx";

// The navigation drawer. Collapsed to a single floating button the user
// can drag to either side edge (its resting spot persists in settings);
// pressing it slides the drawer in from that same side over a dimmed
// backdrop. The drawer lists the app's views (the active checklist and the
// archive) and highlights the current one. Selecting a view navigates and
// closes the drawer. Pinned to the bottom is what used to be the top-right
// burger menu — settings, "what's new", and the project links (privacy,
// source with the app version as a subtitle, optional donate), in inverted
// order so the whole of it sits flush at the foot of the drawer. The drawer
// itself slides in from its resting edge on open (see the `drawer-*`
// keyframes in styles/theme.css). Kept presentational —
// App owns the open/current state and the persisted position, mirroring
// how ChecklistView is wired.

const SOURCE_URL = "https://github.com/niclaslindstedt/checklist";

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
  /** Namespaces known on this device (default first). */
  namespaces: Namespace[];
  /** The active namespace's slug. */
  activeNamespace: string;
  /** Make a namespace active. */
  onSwitchNamespace: (slug: string) => void;
  /** Open the namespace management dialog (add / rename / delete). */
  onManageNamespaces: () => void;
  /** Open the settings modal. */
  onOpenSettings: () => void;
  /** Open the changelog ("what's new") modal. */
  onOpenChangelog: () => void;
  /** Where the floating button rests; defaults to the left edge. */
  position?: MenuButtonPosition;
  /** Persist a new resting spot after the user drags the button. */
  onPositionChange?: (next: MenuButtonPosition) => void;
  /**
   * Reports whether the floating button is mid-drag, so the parent can
   * suppress competing global gestures (pull-to-refresh) while the user is
   * dragging the button around.
   */
  onDraggingChange?: (dragging: boolean) => void;
};

export function SideMenu({
  open,
  onToggle,
  onClose,
  current,
  onNavigate,
  archivedCount,
  namespaces,
  activeNamespace,
  onSwitchNamespace,
  onManageNamespaces,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenSettings,
  onOpenChangelog,
  position = DEFAULT_MENU_BUTTON_POSITION,
  onPositionChange,
  onDraggingChange,
}: Props) {
  const t = useT();
  const drawerId = useId();
  const drag = useDraggableMenuButton(position, onPositionChange ?? (() => {}));

  // Mirror the live drag state up so the parent can gate pull-to-refresh
  // off while the button is being dragged.
  useEffect(() => {
    onDraggingChange?.(drag.dragging);
  }, [drag.dragging, onDraggingChange]);

  // Build-time env (string | undefined). A blank value disables the donate
  // entry entirely rather than linking nowhere.
  const donateUrl = import.meta.env.VITE_DONATE_URL?.trim();
  // BASE_URL carries the trailing slash, so this is `/privacy`,
  // `/preview/privacy`, … depending on the deploy slot.
  const privacyUrl = `${import.meta.env.BASE_URL}privacy`;

  // Footer actions open a modal, so close the drawer behind them.
  function pick(handler: () => void) {
    onClose();
    handler();
  }

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
            className="drawer-backdrop absolute inset-0 cursor-default bg-black/50"
          />
          <nav
            id={drawerId}
            aria-label={t("nav.label")}
            className={`relative flex w-64 max-w-[80%] flex-col overflow-y-auto bg-surface shadow-xl [padding-bottom:env(safe-area-inset-bottom)] [padding-top:env(safe-area-inset-top)] ${
              onRight
                ? "drawer-panel-right border-l border-line"
                : "drawer-panel-left border-r border-line"
            }`}
          >
            <p className="border-b border-line px-5 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
              {t("namespace.section")}
            </p>
            {namespaces.map((ns) => (
              <NavItem
                key={ns.slug}
                icon={
                  ns.slug === activeNamespace ? (
                    <CheckIcon className="h-5 w-5" />
                  ) : (
                    <FolderIcon className="h-5 w-5" />
                  )
                }
                label={ns.name}
                active={ns.slug === activeNamespace}
                onClick={() => {
                  onSwitchNamespace(ns.slug);
                  onClose();
                }}
              />
            ))}
            <NavItem
              icon={<PlusIcon className="h-5 w-5" />}
              label={t("namespace.newAction")}
              active={false}
              onClick={() => pick(onManageNamespaces)}
            />
            <p className="border-t border-line px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
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
            {/* The old top-right burger menu, pinned to the foot of the
                drawer with its order inverted so it reads bottom-up. */}
            <div className="mt-auto flex flex-col border-t border-line">
              {donateUrl && (
                <MenuLink
                  icon={<HeartIcon className="h-5 w-5 text-danger" />}
                  label={t("menu.donate")}
                  href={donateUrl}
                  external
                  onClick={onClose}
                />
              )}
              <MenuLink
                icon={<CodeIcon className="h-5 w-5" />}
                label={t("menu.source")}
                href={SOURCE_URL}
                external
                sublabel={BUILD_LABEL}
                onClick={onClose}
              />
              <MenuLink
                icon={<ShieldIcon className="h-5 w-5" />}
                label={t("menu.privacy")}
                href={privacyUrl}
                onClick={onClose}
              />
              <MenuButton
                icon={<SparklesIcon className="h-5 w-5" />}
                label={t("menu.changelog")}
                onClick={() => pick(onOpenChangelog)}
              />
              <MenuButton
                icon={<CogIcon className="h-5 w-5" />}
                label={t("menu.settings")}
                onClick={() => pick(onOpenSettings)}
              />
            </div>
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

// Footer rows reuse the NavItem geometry (px-5 py-3, gap-3, h-5 icons) so
// the relocated burger menu reads as one continuous list with the views
// above it. A plain button for in-app actions, an anchor for the links.
function MenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

function MenuLink({
  icon,
  label,
  href,
  external,
  sublabel,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  href: string;
  external?: boolean;
  /** Secondary line beneath the label (e.g. the app version). */
  sublabel?: string;
  onClick?: () => void;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="text-muted">{icon}</span>
      <span className="flex flex-1 flex-col">
        <span>{label}</span>
        {sublabel && (
          <span className="text-xs text-muted tabular-nums">{sublabel}</span>
        )}
      </span>
    </a>
  );
}
