// The folder-row family for the navigation drawer: the shared header, the
// desktop / touch action variants dispatched by `FolderRow`, and the inline
// name editor. These are "dumb" presentational components like the generic
// rows in `SideMenuRows.tsx`, but everything here is specific to folders —
// keeping the family in one module leaves `SideMenuRows.tsx` to the reusable
// drawer building blocks.

import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import { useSwipeReveal } from "./hooks/useSwipeReveal.ts";
import type { ContextMenuItem } from "./hooks/useContextMenu.ts";
import { REMOVE_ACTION_W } from "./SideMenuRows.tsx";
import {
  CaretRightIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "./icons.tsx";

// The minimal shape `useContextMenu().open` accepts — a React pointer event
// satisfies it, so a row hands its event straight through. Declared here so
// the folder row can take `openMenu` as a prop without importing the hook's
// internal event type.
type OpenMenu = (
  items: ContextMenuItem[],
  e: { preventDefault: () => void; clientX: number; clientY: number },
) => void;

// The drop highlight a folder paints while a dragged checklist hovers it.
const FOLDER_DROP_CLASS = "bg-accent/15 ring-1 ring-accent/40 ring-inset";

// Props shared by both folder-row variants. `openMenu` is desktop-only (the
// right-click menu); the touch variant ignores it.
type FolderRowProps = {
  name: string;
  count: number;
  expanded: boolean;
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
};

// The collapse toggle (caret + folder glyph + name + count) plus the trailing
// "+" that starts a new list filed inside the folder. Identical on desktop and
// touch — only the surrounding action affordance differs — so `FolderRow`
// builds it once and hands the element to whichever variant it dispatches.
// The open glyph + accent tint mark an expanded folder. The toggle and the
// "+" are siblings, not nested buttons: tapping the label expands the folder;
// the far-right "+" starts a list inside.
function FolderRowHeader({
  name,
  count,
  expanded,
  addLabel,
  onToggle,
  onAdd,
}: {
  name: string;
  count: number;
  expanded: boolean;
  addLabel: string;
  onToggle: () => void;
  onAdd: () => void;
}) {
  return (
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
}

// Desktop folder row: a right-click anywhere on the header opens a Rename /
// Delete context menu. No swipe machinery (that's the touch variant), so this
// renders without ever mounting `useSwipeReveal`.
function FolderRowDesktop({
  isDropTarget,
  renameLabel,
  deleteLabel,
  onRename,
  onDelete,
  onDragOver,
  onDragLeave,
  onDrop,
  openMenu,
  header,
}: FolderRowProps & { header: ReactNode }) {
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
      className={`text-sm ${
        isDropTarget ? FOLDER_DROP_CLASS : "hover:bg-surface-2"
      }`}
    >
      {header}
    </div>
  );
}

// Touch folder row: a left swipe reveals an Edit / Delete action strip (a
// folder has no archive analogue, so a right swipe is inert).
function FolderRowTouch({
  isDropTarget,
  renameLabel,
  deleteLabel,
  onRename,
  onDelete,
  onDragOver,
  onDragLeave,
  onDrop,
  header,
}: FolderRowProps & { header: ReactNode }) {
  const swipe = useSwipeReveal(REMOVE_ACTION_W);
  return (
    <div className="relative overflow-hidden text-sm">
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
      {/* The drop highlight lives on this foreground layer, not the wrapper:
          its `bg-surface` is opaque and would otherwise paint over an accent
          tint set on an ancestor, so a folder hovered by a dragged list would
          never light up. When it's the drop target the accent tint replaces
          the surface fill (and adds the ring) right where it's visible. */}
      <div
        {...swipe.handlers}
        data-swipe-row
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={`relative [touch-action:pan-y] ${
          isDropTarget ? FOLDER_DROP_CLASS : "bg-surface"
        } ${swipe.animating ? "transition-transform duration-200" : ""}`}
      >
        {header}
      </div>
    </div>
  );
}

// A folder group: header + the right action affordance for the pointer type.
// Desktop right-click offers Rename / Delete; touch reveals an Edit / Delete
// strip on a left swipe. Splitting on `desktop` here (rather than branching
// inside one component) keeps the swipe hook off the desktop path entirely.
// The shared header element is built once here so its prop set lives in one
// place instead of being repeated per variant.
export function FolderRow({
  desktop,
  ...props
}: FolderRowProps & {
  desktop: boolean;
}) {
  const header = (
    <FolderRowHeader
      name={props.name}
      count={props.count}
      expanded={props.expanded}
      addLabel={props.addLabel}
      onToggle={props.onToggle}
      onAdd={props.onAdd}
    />
  );
  return desktop ? (
    <FolderRowDesktop {...props} header={header} />
  ) : (
    <FolderRowTouch {...props} header={header} />
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
