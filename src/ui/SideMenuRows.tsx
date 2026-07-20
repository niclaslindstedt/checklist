// Generic presentational row components for the navigation drawer
// (`SideMenu.tsx`): section headers, nav rows, swipe-to-remove wrappers, and
// the footer menu / action-bar buttons. These are all "dumb" — they take
// props and render, reaching into no context — so they live beside `SideMenu`
// rather than inside it (which would push the drawer past the 1000-line
// source cap). `SideMenu` composes them; the drag / drop wiring
// (`data-checklist-drop`, the desktop HTML5 handlers, and the highlight
// flags) is threaded in as props. The folder-specific row family lives in
// `SideMenuFolderRow.tsx`.

import {
  useEffect,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import { useSwipeReveal } from "./hooks/useSwipeReveal.ts";
import { CHECKLIST_DROP_ATTR } from "./checklist-drag-context.ts";
import {
  CaretRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
} from "./icons.tsx";

// A section label with an optional trailing action pinned to its trailing
// edge. For Checklists the action is a "+" that adds a new list; for the
// Namespace heading it's a cogwheel, because that action opens the full
// manage-and-create dialog rather than adding one inline. The first section
// omits the top border; every later one draws one to separate it from the
// rows above. When `collapsible`, the label becomes a toggle button with a
// leading caret (rotated down when `expanded`) — the Namespace heading uses
// this so the seldom-changed namespace list can fold away, leaving just the
// active namespace beneath.
export function SectionHeader({
  label,
  border = false,
  onAdd,
  addLabel,
  addIcon = <PlusIcon className="h-4 w-4" />,
  collapsible = false,
  expanded = false,
  onToggle,
}: {
  label: string;
  border?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  addIcon?: ReactNode;
  collapsible?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const labelText = (
    <span className="text-xs font-semibold tracking-wide text-muted uppercase">
      {label}
    </span>
  );
  return (
    <div
      className={`flex items-center justify-between gap-2 px-5 pt-3 pb-1 ${
        border ? "border-t border-line" : ""
      }`}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="-ml-1 flex min-w-0 cursor-pointer items-center gap-1 rounded pl-1 text-left text-muted hover:text-fg-bright"
        >
          <CaretRightIcon
            className={`h-3 w-3 shrink-0 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
          {labelText}
        </button>
      ) : (
        labelText
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className="-mr-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
        >
          {addIcon}
        </button>
      )}
    </div>
  );
}

export function NavItem({
  icon,
  label,
  active,
  badge,
  disabled = false,
  indent = false,
  onClick,
  dropId,
  isDropTarget = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  disabled?: boolean;
  /** Nudge the row right one level — used by lists nested inside a folder. */
  indent?: boolean;
  onClick: () => void;
  // Drop-target wiring: a `data-checklist-drop` key (so the touch drag layer
  // hit-tests it) plus the desktop HTML5 handlers and a highlight flag. Used to
  // make a namespace row accept a dragged checklist.
  dropId?: string;
  isDropTarget?: boolean;
  onDragOver?: (e: ReactDragEvent) => void;
  onDragLeave?: (e: ReactDragEvent) => void;
  onDrop?: (e: ReactDragEvent) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      {...(dropId !== undefined ? { [CHECKLIST_DROP_ATTR]: dropId } : {})}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex w-full items-center gap-3 py-[var(--density-row-py)] text-left text-sm ${
        indent ? "pr-5 pl-10" : "px-5"
      } ${
        disabled
          ? "cursor-not-allowed text-muted/50"
          : isDropTarget
            ? "cursor-pointer bg-accent/15 text-fg-bright ring-1 ring-accent/40 ring-inset"
            : active
              ? "cursor-pointer bg-accent/20 font-semibold text-fg-bright shadow-[inset_3px_0_0_var(--color-accent)]"
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

// Wraps a drawer row so a left swipe latches it open to reveal a trailing
// trash button (see `useSwipeReveal`). `confirmLabel`, when given, makes the
// removal a two-tap action: the first tap on the trash arms a confirming
// state (the button reads `confirmLabel`) and only the second tap commits —
// the double confirmation a namespace deletion warrants. A checklist passes
// no `confirmLabel`, so its single tap removes straight away (recoverable
// via undo). The sliding foreground carries its own surface background so it
// covers the action while closed. Exported because the touch folder row
// (`SideMenuFolderRow.tsx`) sizes its Edit / Delete strip to the same width,
// keeping every drawer swipe strip on one geometry.
export const REMOVE_ACTION_W = 96;

export function SwipeToRemove({
  actionLabel,
  confirmLabel,
  onRemove,
  children,
}: {
  /** Accessible label for the trash button in its resting state. */
  actionLabel: string;
  /** When set, removal needs a second confirming tap reading this label. */
  confirmLabel?: string;
  onRemove: () => void | Promise<void>;
  children: ReactNode;
}) {
  const swipe = useSwipeReveal(REMOVE_ACTION_W);
  const [confirming, setConfirming] = useState(false);

  // Closing the row (a tap on an open row, or a swipe back) disarms the
  // confirm step so it never lingers half-armed for the next open.
  useEffect(() => {
    if (!swipe.open) setConfirming(false);
  }, [swipe.open]);

  function act() {
    if (confirmLabel && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    swipe.close();
    void onRemove();
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end">
        <button
          type="button"
          onClick={act}
          aria-label={confirming ? confirmLabel : actionLabel}
          style={{ width: REMOVE_ACTION_W }}
          className="flex h-full items-center justify-center bg-danger text-xs font-semibold tracking-wide text-white uppercase"
        >
          {confirming ? confirmLabel : <TrashIcon className="h-5 w-5" />}
        </button>
      </div>
      <div
        {...swipe.handlers}
        data-swipe-row
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={`relative bg-surface [touch-action:pan-y] ${
          swipe.animating ? "transition-transform duration-200" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// Footer rows reuse the NavItem geometry (px-5, the density vertical
// padding, gap-3, h-5 icons) so the relocated burger menu reads as one
// continuous list with the rows above it. A plain button for in-app
// actions, an anchor for the links.
export function MenuButton({
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
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

export function MenuLink({
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
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
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

// One checklist row's touch action strip: a left swipe latches open a trailing
// trash button. Moving a list between folders/namespaces is a drag gesture now
// (see `checklist-drag.tsx`), so the strip carries only delete. Desktop uses a
// right-click menu instead and never renders this.
const ROW_STRIP_W = 48;

export function ChecklistRowStrip({
  removeLabel,
  onRemove,
  children,
}: {
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const swipe = useSwipeReveal(ROW_STRIP_W);
  return (
    <div className="relative overflow-hidden">
      <div
        className={`absolute inset-0 flex items-center justify-end ${
          swipe.offset < 0 ? "" : "invisible"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            swipe.close();
            onRemove();
          }}
          aria-label={removeLabel}
          style={{ width: ROW_STRIP_W }}
          className="flex h-full items-center justify-center bg-danger text-white"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </div>
      <div
        {...swipe.handlers}
        data-swipe-row
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={`relative bg-surface [touch-action:pan-y] ${
          swipe.animating ? "transition-transform duration-200" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// The thin chevron rail seated just above the footer. A full-width button one
// line tall: pressing it folds the footer (Donate / trophy / About / Settings)
// away to give the checklist list more room, and again to bring it back. The
// chevron points down to collapse (fold the footer down out of view) and up to
// restore it, mirroring the direction the footer travels.
export function FooterCollapseRail({
  collapsed,
  label,
  onClick,
}: {
  collapsed: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="flex w-full shrink-0 cursor-pointer items-center justify-center border-t border-line py-[calc(var(--density-row-py)+0.25rem)] text-muted hover:bg-surface-2 hover:text-fg-bright"
    >
      {collapsed ? (
        <ChevronUpIcon className="h-4 w-4" />
      ) : (
        <ChevronDownIcon className="h-4 w-4" />
      )}
    </button>
  );
}

// The icon buttons that fill the footer action panel: New list / New folder /
// Archive on the top row, Undo / Redo on the bottom. The cells sit flush
// against one another (the parent owns the border, rounding, and the inner
// `divide-x` / `divide-y` dividers) and split each row's width evenly. The
// buttons are icon-only (the label rides on `aria-label` / `title`); the active
// view tints accent, Archive carries its count as a corner badge, and a
// `disabled` cell (an undo/redo end-stop) dims and goes inert.
export function BarButton({
  icon,
  label,
  active = false,
  badge,
  disabled = false,
  onClick,
  dropId,
  isDropTarget = false,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  disabled?: boolean;
  onClick: () => void;
  // Drop-target wiring so the Archive button accepts a dragged checklist.
  dropId?: string;
  isDropTarget?: boolean;
  onDragOver?: (e: ReactDragEvent) => void;
  onDragLeave?: (e: ReactDragEvent) => void;
  onDrop?: (e: ReactDragEvent) => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      {...(dropId !== undefined ? { [CHECKLIST_DROP_ATTR]: dropId } : {})}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex flex-1 items-center justify-center py-2.5 ${
        disabled
          ? "cursor-not-allowed text-muted opacity-40"
          : isDropTarget
            ? "cursor-pointer bg-accent/15 text-fg-bright"
            : active
              ? "cursor-pointer bg-surface-2 text-fg-bright"
              : "cursor-pointer text-fg hover:bg-surface-2 hover:text-fg-bright"
      }`}
    >
      <span className={active ? "text-accent" : "text-muted"}>{icon}</span>
      {badge !== undefined && (
        <span className="absolute top-0.5 right-0.5 rounded-full bg-surface-3 px-1 py-0.5 text-[10px] leading-none text-muted tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}
