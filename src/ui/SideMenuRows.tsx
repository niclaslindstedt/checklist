// Presentational row components for the navigation drawer (`SideMenu.tsx`).
// These are all "dumb" — they take props and render, reaching into no context —
// so they live beside `SideMenu` rather than inside it (which would push the
// drawer past the 1000-line source cap). `SideMenu` composes them; the drag /
// drop wiring (`data-checklist-drop`, the desktop HTML5 handlers, and the
// highlight flags) is threaded in as props.

import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import { useSwipeReveal } from "./hooks/useSwipeReveal.ts";
import type { ContextMenuItem } from "./hooks/useContextMenu.ts";
import { CHECKLIST_DROP_ATTR } from "./checklist-drag-context.ts";
import {
  CaretRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  PencilIcon,
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

// Undo / redo render as a side-by-side pair rather than full-width rows so
// the two fit on one line at the foot of the drawer. Each is a self-contained
// bordered button (icon + label, centred) that dims and goes inert at the
// ends of the timeline, where there is nothing to revert or re-apply.
export function EditButton({
  icon,
  label,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md border border-line py-2.5 text-sm ${
        disabled
          ? "cursor-not-allowed text-muted opacity-40"
          : "cursor-pointer text-fg hover:bg-surface-2 hover:text-fg-bright"
      }`}
    >
      <span className={disabled ? "" : "text-muted"}>{icon}</span>
      <span>{label}</span>
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
// covers the action while closed.
const REMOVE_ACTION_W = 96;

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

// The minimal shape `useContextMenu().open` accepts — a React pointer event
// satisfies it, so a row hands its event straight through. Declared here so
// the folder row can take `openMenu` as a prop without importing the hook's
// internal event type.
type OpenMenu = (
  items: ContextMenuItem[],
  e: { preventDefault: () => void; clientX: number; clientY: number },
) => void;

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

// A folder group header: a collapse toggle (caret + folder glyph + name +
// count) plus a trailing "+" that starts a new list filed inside the folder.
// Desktop right-click offers Rename / Delete; touch reveals an Edit / Delete
// strip on a left swipe (a folder has no archive analogue, so a right swipe is
// inert). The open glyph + accent tint mark an expanded folder.
export function FolderRow({
  name,
  count,
  expanded,
  desktop,
  isDropTarget,
  renameLabel,
  deleteLabel,
  addLabel,
  onToggle,
  onRename,
  onDelete,
  onAdd,
  onDragOver,
  onDragLeave,
  onDrop,
  openMenu,
}: {
  name: string;
  count: number;
  expanded: boolean;
  desktop: boolean;
  /** A dragged checklist is hovering this folder — paint the drop highlight. */
  isDropTarget: boolean;
  renameLabel: string;
  deleteLabel: string;
  addLabel: string;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAdd: () => void;
  onDragOver: (e: ReactDragEvent) => void;
  onDragLeave: (e: ReactDragEvent) => void;
  onDrop: (e: ReactDragEvent) => void;
  openMenu: OpenMenu;
}) {
  const swipe = useSwipeReveal(REMOVE_ACTION_W);
  const dropClass = isDropTarget
    ? "bg-accent/15 ring-1 ring-accent/40 ring-inset"
    : "";
  const header = (
    // The toggle and the "+" are siblings, not nested buttons: tapping the
    // label expands the folder; the far-right "+" starts a list inside it.
    <div className="flex w-full min-w-0 items-center">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-[var(--density-row-py)] pr-1 pl-3 text-left text-fg hover:text-fg-bright"
      >
        <span className="text-muted">
          {expanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <CaretRightIcon className="h-4 w-4" />
          )}
        </span>
        <span className={expanded ? "text-accent" : "text-muted"}>
          {expanded ? (
            <FolderOpenIcon className="h-5 w-5" />
          ) : (
            <FolderIcon className="h-5 w-5" />
          )}
        </span>
        <span className="flex-1 truncate">{name}</span>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted tabular-nums">
            {count}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        aria-label={addLabel}
        title={addLabel}
        className="mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );

  if (desktop) {
    return (
      <div
        onContextMenu={(e) =>
          openMenu(
            [
              {
                label: renameLabel,
                icon: <PencilIcon className="h-4 w-4" />,
                onSelect: onRename,
              },
              {
                label: deleteLabel,
                icon: <TrashIcon className="h-4 w-4" />,
                onSelect: onDelete,
                danger: true,
              },
            ],
            e,
          )
        }
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`text-sm ${isDropTarget ? dropClass : "hover:bg-surface-2"}`}
      >
        {header}
      </div>
    );
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative overflow-hidden text-sm ${dropClass}`}
    >
      <div
        aria-hidden={swipe.offset >= 0}
        className={`absolute inset-0 flex items-center justify-end ${
          swipe.offset < 0 ? "" : "invisible"
        }`}
      >
        <div className="flex h-full" style={{ width: REMOVE_ACTION_W }}>
          <button
            type="button"
            onClick={() => {
              swipe.close();
              onRename();
            }}
            aria-label={renameLabel}
            className="flex h-full flex-1 items-center justify-center bg-surface-3 text-fg-bright"
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              swipe.close();
              onDelete();
            }}
            aria-label={deleteLabel}
            className="flex h-full flex-1 items-center justify-center bg-danger text-white"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div
        {...swipe.handlers}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={`relative bg-surface [touch-action:pan-y] ${
          swipe.animating ? "transition-transform duration-200" : ""
        }`}
      >
        {header}
      </div>
    </div>
  );
}

// The inline folder name editor, used both for creating a folder (empty) and
// renaming one (seeded with its name). Commits on Enter or blur with a
// non-empty trimmed name; an empty name (or Escape) cancels — which is what
// makes a freshly-added, never-named folder simply vanish on defocus. The
// `committed` latch stops the blur that follows an Enter from firing twice.
export function FolderEditRow({
  initial = "",
  placeholder,
  onCommit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [committed, setCommitted] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // Focus (and select) on mount — the row only appears on an explicit
  // "new folder" / "rename" action, so it takes focus straight away.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  function finish() {
    if (committed) return;
    setCommitted(true);
    const name = value.trim();
    if (name) onCommit(name);
    else onCancel();
  }
  return (
    <div className="flex items-center gap-2 py-[var(--density-row-py)] pr-2 pl-3">
      <span className="text-muted">
        <FolderIcon className="h-5 w-5" />
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setCommitted(true);
            onCancel();
          }
        }}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-fg-bright outline-none placeholder:text-muted/60"
      />
    </div>
  );
}

// New list / New folder / Archive render as a compact segmented bar instead of
// full-width rows, saving vertical space the way Undo / Redo do. The cells sit
// flush against one another (the parent owns the border, rounding, and inner
// `divide-x` dividers) and split the width evenly. The buttons are icon-only
// (the label rides on `aria-label` / `title`); the active view tints accent,
// and Archive carries its count as a corner badge.
export function BarButton({
  icon,
  label,
  active = false,
  badge,
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
      onClick={onClick}
      {...(dropId !== undefined ? { [CHECKLIST_DROP_ATTR]: dropId } : {})}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex flex-1 cursor-pointer items-center justify-center py-2.5 ${
        isDropTarget
          ? "bg-accent/15 text-fg-bright"
          : active
            ? "bg-surface-2 text-fg-bright"
            : "text-fg hover:bg-surface-2 hover:text-fg-bright"
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
