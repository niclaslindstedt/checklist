import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { BUILD_LABEL } from "../build-env.ts";
import type {
  ChecklistSummary,
  FolderSummary,
} from "../app/use-checklist-lists.ts";
import { useT } from "../i18n";
import { REPO_URL } from "../seo/siteConfig.ts";
import {
  DEFAULT_NAMESPACE_SLUG,
  type Namespace,
} from "../storage/namespaces.ts";
import { APP_VIEWPORT_RECT } from "./appViewportRect.ts";
import { ContextMenu } from "./ContextMenu.tsx";
import { useChecklistContext } from "./checklist-context.ts";
import { useNav } from "./nav-context.ts";
import { useContextMenu } from "./hooks/useContextMenu.ts";
import { useDesktopPointer } from "./hooks/useMediaQuery.ts";
import { useDraggableMenuButton } from "./hooks/useDraggableMenuButton.ts";
import { useSwipeReveal } from "./hooks/useSwipeReveal.ts";
import {
  ArchiveIcon,
  CaretRightIcon,
  CheckIcon,
  ChecklistIcon,
  ChevronDownIcon,
  CodeIcon,
  CogIcon,
  FolderIcon,
  FolderOpenIcon,
  HeartIcon,
  MenuIcon,
  PencilIcon,
  PlusIcon,
  RedoIcon,
  ShieldIcon,
  SparklesIcon,
  TrashIcon,
  UndoIcon,
} from "./icons.tsx";
import type { ContextMenuItem } from "./hooks/useContextMenu.ts";
import { useModalDispatch } from "./modal-bus.ts";
import { NamespaceGlyph } from "./NamespaceGlyph.tsx";
import { TrophyButton } from "./achievements/TrophyButton.tsx";

// The navigation drawer. On viewports narrower than the smallest iPad it
// collapses to a single floating button the user can drag to either side
// edge (its resting spot persists in settings); pressing it slides the
// drawer in from that same side over a dimmed backdrop. From the smallest
// iPad up (`nav.pinned`) the same panel is instead docked open as a
// permanent sidebar beside the content — no button, no backdrop, no
// open/close — so wider screens always see the navigation. Both variants
// render the identical section list (`sections` below); only the framing
// differs. The drawer lists every checklist by name (the switcher — click
// to make one active; a "+" on the Checklists heading adds a new one) with
// the archive view at the foot of that same list, highlighting the active
// list and current view. Selecting one navigates and closes the drawer.
// The Namespace heading carries a cogwheel that opens the combined
// manage-and-create namespaces dialog. Pinned to
// the bottom is what used to be the top-right
// burger menu — settings, "what's new", and the project links (privacy,
// source with the app version as a subtitle, optional donate), in inverted
// order so the whole of it sits flush at the foot of the drawer. The drawer
// itself slides in from its resting edge on open (see the `drawer-*`
// keyframes in styles/theme.css). The open/current/position state comes
// from `useNav` and the undo/redo/archive counts from `useChecklistContext`
// rather than props threaded down from App; the footer actions `dispatch` a
// modal command on the bus (see `modal-bus.ts`). Only the namespace list and
// its remove verb — storage state, not nav or checklist — are passed as props.
//
// Both lists support swipe-to-remove: a left swipe on a namespace or
// checklist row latches open a trash button (see `useSwipeReveal`).
// Removing a checklist is one tap and recoverable via undo; removing a
// namespace destroys a whole document in the active backend, so it asks for
// a second confirming tap. The default namespace and the last remaining
// checklist are never removable, so they render as plain rows.

const SOURCE_URL = REPO_URL;

type Props = {
  /** Namespaces known on this device (default first). */
  namespaces: Namespace[];
  /** The active namespace's slug. */
  activeNamespace: string;
  /** Make a namespace active. */
  onSwitchNamespace: (slug: string) => void;
  /** Remove a namespace and its data in the active backend (default can't). */
  onRemoveNamespace: (slug: string) => Promise<void>;
};

export function SideMenu({
  namespaces,
  activeNamespace,
  onSwitchNamespace,
  onRemoveNamespace,
}: Props) {
  const t = useT();
  const dispatch = useModalDispatch();
  const drawerId = useId();
  const {
    open,
    current,
    toggle,
    close,
    navigate,
    setDragging,
    position,
    setPosition,
    showButton,
    pinned,
  } = useNav();
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    archivedGroups,
    checklists,
    archivedChecklists,
    activeChecklistId,
    selectChecklist,
    addChecklist,
    removeChecklist,
    archiveChecklist,
    folders,
    createFolder,
    renameFolder,
    removeFolder,
    moveChecklistToFolder,
    addChecklistInFolder,
  } = useChecklistContext();
  // Sidebar folder UI state, all device-local: which folders are collapsed
  // (empty = all expanded, the screenshot's default), whether the inline
  // "new folder" name input is showing, and which folder is being renamed.
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const toggleFolder = (id: string) =>
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // The archive badge counts archived items plus whole archived lists.
  const archivedCount =
    archivedGroups.reduce((n, g) => n + g.items.length, 0) +
    archivedChecklists.length;
  const drag = useDraggableMenuButton(position, setPosition);
  const desktop = useDesktopPointer();
  const {
    state: menuState,
    open: openMenu,
    close: closeMenu,
  } = useContextMenu();

  // Mirror the live drag state up so the parent can gate pull-to-refresh
  // off while the button is being dragged.
  useEffect(() => {
    setDragging(drag.dragging);
  }, [drag.dragging, setDragging]);

  // Build-time env (string | undefined). A blank value disables the donate
  // entry entirely rather than linking nowhere.
  const donateUrl = import.meta.env.VITE_DONATE_URL?.trim();
  // BASE_URL carries the trailing slash, so this is `/privacy`,
  // `/preview/privacy`, … depending on the deploy slot.
  const privacyUrl = `${import.meta.env.BASE_URL}privacy`;

  // Footer actions open a modal, so close the drawer behind them.
  function pick(handler: () => void) {
    close();
    handler();
  }

  // Dismiss on Escape while open (the backdrop handles pointer dismissal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const onRight = position.side === "right";

  // The "move to folder" entries for a checklist's actions menu: one per other
  // folder, plus "Remove from folder" when it's currently grouped. Empty when
  // there's nowhere to move it (no folders, and it's already ungrouped).
  function moveMenuItems(c: ChecklistSummary): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    for (const f of folders) {
      if (f.id === c.folderId) continue;
      items.push({
        label: t("nav.moveToFolder", { name: f.name }),
        icon: <FolderIcon className="h-4 w-4" />,
        onSelect: () => moveChecklistToFolder(c.id, f.id),
      });
    }
    if (c.folderId) {
      items.push({
        label: t("nav.removeFromFolder"),
        icon: <FolderIcon className="h-4 w-4" />,
        onSelect: () => moveChecklistToFolder(c.id, null),
      });
    }
    return items;
  }

  // One checklist row in the switcher. `indent` nudges it right when it sits
  // inside an expanded folder. Desktop gets a right-click actions menu
  // (archive / move / remove); touch gets a swipe strip (move / delete). The
  // last remaining list with nowhere to move renders as a plain, action-less
  // row — the views always need one list to show.
  function renderChecklistRow(c: ChecklistSummary, indent = false): ReactNode {
    const row = (
      <NavItem
        icon={
          c.id === activeChecklistId ? (
            <CheckIcon className="h-5 w-5" />
          ) : (
            <ChecklistIcon className="h-5 w-5" />
          )
        }
        label={c.name}
        active={c.id === activeChecklistId && current === "checklist"}
        badge={c.remaining > 0 ? c.remaining : undefined}
        indent={indent}
        onClick={() => {
          selectChecklist(c.id);
          navigate("checklist");
        }}
      />
    );
    const canRemove = checklists.length > 1;
    const moveItems = moveMenuItems(c);
    if (!canRemove && moveItems.length === 0) {
      return <div key={c.id}>{row}</div>;
    }
    if (desktop) {
      const actions: ContextMenuItem[] = [];
      if (canRemove) {
        actions.push({
          label: t("app.archive"),
          icon: <ArchiveIcon className="h-4 w-4" />,
          onSelect: () => archiveChecklist(c.id),
        });
      }
      actions.push(...moveItems);
      if (canRemove) {
        actions.push({
          label: t("nav.removeChecklist"),
          icon: <TrashIcon className="h-4 w-4" />,
          danger: true,
          onSelect: () => removeChecklist(c.id),
        });
      }
      return (
        <div key={c.id} onContextMenu={(e) => openMenu(actions, e)}>
          {row}
        </div>
      );
    }
    return (
      <ChecklistRowStrip
        key={c.id}
        canRemove={canRemove}
        moveLabel={moveItems.length > 0 ? t("nav.moveTo") : undefined}
        removeLabel={t("nav.removeChecklist")}
        onMove={(e) => openMenu(moveItems, e)}
        onRemove={() => removeChecklist(c.id)}
      >
        {row}
      </ChecklistRowStrip>
    );
  }

  // One folder group: its header row (collapse toggle + name + count + a "+"
  // that starts a new list inside it) and, when expanded, the lists filed in
  // it. While being renamed the header is swapped for the inline name editor.
  function renderFolder(f: FolderSummary): ReactNode {
    if (renamingFolderId === f.id) {
      return (
        <FolderEditRow
          key={f.id}
          initial={f.name}
          placeholder={t("nav.folderName")}
          onCommit={(name) => {
            renameFolder(f.id, name);
            setRenamingFolderId(null);
          }}
          onCancel={() => setRenamingFolderId(null)}
        />
      );
    }
    const expanded = !collapsedFolders.has(f.id);
    const inside = checklists.filter((c) => c.folderId === f.id);
    return (
      <div key={f.id}>
        <FolderRow
          name={f.name}
          count={f.count}
          expanded={expanded}
          desktop={desktop}
          renameLabel={t("nav.renameFolder")}
          deleteLabel={t("nav.deleteFolder")}
          addLabel={t("nav.newChecklist")}
          onToggle={() => toggleFolder(f.id)}
          onRename={() => setRenamingFolderId(f.id)}
          onDelete={() => removeFolder(f.id)}
          onAdd={() => {
            addChecklistInFolder(f.id);
            navigate("checklist");
          }}
          openMenu={openMenu}
        />
        {expanded && inside.map((c) => renderChecklistRow(c, true))}
      </div>
    );
  }

  const ungroupedChecklists = checklists.filter((c) => !c.folderId);

  // The drawer's body — identical whether it slides in over a backdrop
  // (narrow viewports) or sits docked as a permanent sidebar (pinned). Only
  // the framing `<nav>` differs between the two, so the rows live here once.
  const sections = (
    <>
      <SectionHeader
        label={t("namespace.section")}
        onAdd={() => pick(() => dispatch({ kind: "namespaces" }))}
        addLabel={t("namespace.manage")}
        addIcon={<CogIcon className="h-4 w-4" />}
      />
      {namespaces.map((ns) => {
        // A namespace that has picked an icon or a colour shows its own
        // glyph, tinted to its accent — only the glyph is coloured, never
        // the row's text. One left untouched keeps the plain check (active)
        // / folder (inactive) treatment.
        const customised = Boolean(ns.glyph || ns.color);
        const icon = customised ? (
          <NamespaceGlyph
            name={ns.glyph}
            className="h-5 w-5"
            style={ns.color ? { color: ns.color } : undefined}
          />
        ) : ns.slug === activeNamespace ? (
          <CheckIcon className="h-5 w-5" />
        ) : (
          <FolderIcon className="h-5 w-5" />
        );
        const row = (
          <NavItem
            icon={icon}
            label={ns.name}
            active={ns.slug === activeNamespace}
            onClick={() => {
              onSwitchNamespace(ns.slug);
              close();
            }}
          />
        );
        // The default namespace can't be removed — render it plain.
        if (ns.slug === DEFAULT_NAMESPACE_SLUG) {
          return <div key={ns.slug}>{row}</div>;
        }
        return (
          <SwipeToRemove
            key={ns.slug}
            actionLabel={t("namespace.deleteAction")}
            confirmLabel={t("namespace.confirmDelete")}
            onRemove={() => onRemoveNamespace(ns.slug)}
          >
            {row}
          </SwipeToRemove>
        );
      })}
      {/* The Checklists heading carries no inline "+" any more — New list,
          New folder, and Archive all live on the compact action bar below. */}
      <SectionHeader label={t("nav.checklists")} border />
      {folders.map(renderFolder)}
      {ungroupedChecklists.map((c) => renderChecklistRow(c))}
      {creatingFolder && (
        <FolderEditRow
          placeholder={t("nav.folderName")}
          onCommit={(name) => {
            createFolder(name);
            setCreatingFolder(false);
          }}
          onCancel={() => setCreatingFolder(false)}
        />
      )}
      {/* New list / New folder / Archive share one compact segmented bar
          instead of full-width rows (the way Undo / Redo do at the foot),
          saving vertical space. The three cells split the width evenly; the
          parent owns the border, rounding, and inner dividers. Archive lights
          up accent while its view is showing and carries the archived count. */}
      <div className="px-3 pt-2 pb-1">
        <div className="flex divide-x divide-line overflow-hidden rounded-md border border-line">
          <BarButton
            icon={<PlusIcon className="h-5 w-5" />}
            label={t("nav.newChecklist")}
            onClick={() => {
              addChecklist();
              navigate("checklist");
            }}
          />
          <BarButton
            icon={<FolderIcon className="h-5 w-5" />}
            label={t("nav.newFolder")}
            onClick={() => setCreatingFolder(true)}
          />
          <BarButton
            icon={<ArchiveIcon className="h-5 w-5" />}
            label={t("nav.archive")}
            active={current === "archive"}
            badge={archivedCount > 0 ? archivedCount : undefined}
            onClick={() => navigate("archive")}
          />
        </div>
      </div>
      {/* Undo / redo: a pair of side-by-side buttons pinned to the foot of
          the list (mt-auto), so they sit just above the footer's divider and
          fall under the thumb. Two columns share one row to save vertical
          space; each keeps the drawer open so a burst of reverts can be
          applied without reopening it. */}
      <div className="mt-auto flex gap-2 px-3 pt-3 pb-1">
        <EditButton
          icon={<UndoIcon className="h-5 w-5" />}
          label={t("nav.undo")}
          disabled={!canUndo}
          onClick={undo}
        />
        <EditButton
          icon={<RedoIcon className="h-5 w-5" />}
          label={t("nav.redo")}
          disabled={!canRedo}
          onClick={redo}
        />
      </div>
      {/* The old top-right burger menu, pinned to the foot of the
                drawer with its order inverted so it reads bottom-up. */}
      <div className="flex flex-col border-t border-line [padding-top:calc(1.25rem_-_var(--density-row-py))]">
        {donateUrl && (
          <MenuLink
            icon={<HeartIcon className="h-5 w-5 text-danger" />}
            label={t("menu.donate")}
            href={donateUrl}
            external
            onClick={close}
          />
        )}
        <MenuLink
          icon={<CodeIcon className="h-5 w-5" />}
          label={t("menu.source")}
          href={SOURCE_URL}
          external
          sublabel={BUILD_LABEL}
          onClick={close}
        />
        <MenuLink
          icon={<ShieldIcon className="h-5 w-5" />}
          label={t("menu.privacy")}
          href={privacyUrl}
          onClick={close}
        />
        {/* The trophy, relocated from the header. It does its own
            quiet-vs-lit dispatch, so it just needs the drawer closed
            behind it. Hides itself when achievements are disabled. */}
        <TrophyButton onSelect={close} />
        <MenuButton
          icon={<SparklesIcon className="h-5 w-5" />}
          label={t("menu.changelog")}
          onClick={() => pick(() => dispatch({ kind: "changelog" }))}
        />
        <MenuButton
          icon={<CogIcon className="h-5 w-5" />}
          label={t("menu.settings")}
          onClick={() => pick(() => dispatch({ kind: "settings" }))}
        />
      </div>
      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={closeMenu}
        />
      )}
    </>
  );

  // Pinned: a permanent docked sidebar beside the content. No floating
  // button, no backdrop, no open/close — it's simply always there. App lays
  // it out as a flex sibling of the main view, so a fixed width and a single
  // inner border (on whichever edge faces the content) is all the framing it
  // needs. It docks on the same side the floating button rests on.
  if (pinned) {
    return (
      <nav
        aria-label={t("nav.label")}
        className={`relative flex h-full w-64 shrink-0 flex-col overflow-y-auto bg-surface [padding-bottom:max(env(safe-area-inset-bottom),calc(1.25rem_-_var(--density-row-py)))] [padding-top:env(safe-area-inset-top)] ${
          onRight ? "order-last border-l border-line" : "border-r border-line"
        }`}
      >
        {sections}
      </nav>
    );
  }

  return (
    <>
      {/* Floating toggle the user can drag to either edge; a plain press
          still toggles the drawer (the drag hook swallows the click that
          tails a real drag, and leaves keyboard activation untouched). The
          user can hide it in the installed PWA, where an inward edge swipe
          (see `useEdgeSwipeOpen`) opens the drawer in its place. */}
      {showButton && (
        <button
          type="button"
          onClick={() => {
            if (drag.consumeDragClick()) return;
            toggle();
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
      )}

      {open && (
        <div
          className={`fixed z-50 flex ${onRight ? "justify-end" : ""}`}
          style={APP_VIEWPORT_RECT}
        >
          <button
            type="button"
            aria-label={t("nav.close")}
            tabIndex={-1}
            onClick={close}
            className="drawer-backdrop absolute inset-0 cursor-default bg-black/50"
          />
          <nav
            id={drawerId}
            aria-label={t("nav.label")}
            className={`relative flex w-64 max-w-[80%] flex-col overflow-y-auto bg-surface shadow-xl [padding-bottom:max(env(safe-area-inset-bottom),calc(1.25rem_-_var(--density-row-py)))] [padding-top:env(safe-area-inset-top)] ${
              onRight
                ? "drawer-panel-right border-l border-line"
                : "drawer-panel-left border-r border-line"
            }`}
          >
            {sections}
          </nav>
        </div>
      )}
    </>
  );
}

// A section label with an optional trailing action pinned to its trailing
// edge. For Checklists the action is a "+" that adds a new list; for the
// Namespace heading it's a cogwheel, because that action opens the full
// manage-and-create dialog rather than adding one inline. The first section
// omits the top border; every later one draws one to separate it from the
// rows above.
function SectionHeader({
  label,
  border = false,
  onAdd,
  addLabel,
  addIcon = <PlusIcon className="h-4 w-4" />,
}: {
  label: string;
  border?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  addIcon?: ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-5 pt-3 pb-1 ${
        border ? "border-t border-line" : ""
      }`}
    >
      <span className="text-xs font-semibold tracking-wide text-muted uppercase">
        {label}
      </span>
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

function NavItem({
  icon,
  label,
  active,
  badge,
  disabled = false,
  indent = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  disabled?: boolean;
  /** Nudge the row right one level — used by lists nested inside a folder. */
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 py-[var(--density-row-py)] text-left text-sm ${
        indent ? "pr-5 pl-10" : "px-5"
      } ${
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

// Undo / redo render as a side-by-side pair rather than full-width rows so
// the two fit on one line at the foot of the drawer. Each is a self-contained
// bordered button (icon + label, centred) that dims and goes inert at the
// ends of the timeline, where there is nothing to revert or re-apply.
function EditButton({
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

function SwipeToRemove({
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
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
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
// strip with a "move to folder" button (opens the folder menu) and/or a trash
// button. Which buttons show depends on what's possible — a list with nowhere
// to move shows only trash, the last remaining list shows only move. Desktop
// uses a right-click menu instead and never renders this.
function ChecklistRowStrip({
  canRemove,
  moveLabel,
  removeLabel,
  onMove,
  onRemove,
  children,
}: {
  canRemove: boolean;
  /** Set when the list has somewhere to move; absent hides the move button. */
  moveLabel?: string;
  removeLabel: string;
  onMove: (e: ReactMouseEvent) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const width = (moveLabel ? 48 : 0) + (canRemove ? 48 : 0);
  const swipe = useSwipeReveal(width);
  return (
    <div className="relative overflow-hidden">
      <div
        className={`absolute inset-0 flex items-center justify-end ${
          swipe.offset < 0 ? "" : "invisible"
        }`}
      >
        <div className="flex h-full" style={{ width }}>
          {moveLabel && (
            <button
              type="button"
              onClick={(e) => {
                swipe.close();
                onMove(e);
              }}
              aria-label={moveLabel}
              className="flex h-full w-12 items-center justify-center bg-surface-3 text-fg-bright"
            >
              <FolderIcon className="h-5 w-5" />
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={() => {
                swipe.close();
                onRemove();
              }}
              aria-label={removeLabel}
              className="flex h-full w-12 items-center justify-center bg-danger text-white"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
        </div>
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
function FolderRow({
  name,
  count,
  expanded,
  desktop,
  renameLabel,
  deleteLabel,
  addLabel,
  onToggle,
  onRename,
  onDelete,
  onAdd,
  openMenu,
}: {
  name: string;
  count: number;
  expanded: boolean;
  desktop: boolean;
  renameLabel: string;
  deleteLabel: string;
  addLabel: string;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAdd: () => void;
  openMenu: OpenMenu;
}) {
  const swipe = useSwipeReveal(REMOVE_ACTION_W);
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
        className="text-sm hover:bg-surface-2"
      >
        {header}
      </div>
    );
  }

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
function FolderEditRow({
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
function BarButton({
  icon,
  label,
  active = false,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`relative flex flex-1 cursor-pointer items-center justify-center py-2.5 ${
        active
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
