import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
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
import {
  ArchiveIcon,
  ChecklistIcon,
  CodeIcon,
  CogIcon,
  FolderIcon,
  HeartIcon,
  HelpCircleIcon,
  MenuIcon,
  PlusIcon,
  RedoIcon,
  ShieldIcon,
  SparklesIcon,
  TrashIcon,
  UndoIcon,
} from "./icons.tsx";
import type { ContextMenuItem } from "./hooks/useContextMenu.ts";
import { useModalDispatch } from "./modal-bus.ts";
import { ChecklistDragItem } from "./checklist-drag.tsx";
import {
  CHECKLIST_DROP_ARCHIVE,
  CHECKLIST_DROP_ATTR,
  CHECKLIST_DROP_ROOT,
  checklistDropNamespaceKey,
  useChecklistDrop,
  useChecklistDropKey,
} from "./checklist-drag-context.ts";
import {
  BarButton,
  ChecklistRowStrip,
  FolderEditRow,
  FolderRow,
  MenuButton,
  MenuLink,
  NavItem,
  SectionHeader,
  SwipeToRemove,
} from "./SideMenuRows.tsx";
import { NamespaceGlyph } from "./NamespaceGlyph.tsx";
import { TrophyButton } from "./achievements/TrophyButton.tsx";
import { FloatingPanel } from "./FloatingPanel.tsx";
import type { FloatingPlacement } from "./hooks/useFloatingPosition.ts";

// The About dropdown opens "up and to the left" of its footer trigger:
// `useFloatingPosition` flips it above automatically (there is no room
// below at the foot of the drawer), and it widens to at least the trigger.
const ABOUT_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "left",
  coordinateSpace: "viewport",
};

// The dataTransfer MIME the desktop HTML5 drag stamps the list id onto, so a
// drop reads back which checklist was dragged.
const CHECKLIST_DND_TYPE = "application/x-checklist-id";

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
  // Namespaces are changed seldom, so the section folds shut by default and
  // shows only the active namespace; clicking the heading reveals the rest.
  const [namespacesExpanded, setNamespacesExpanded] = useState(false);
  // The footer "About" dropdown (source / privacy / what's new), opened
  // against `aboutRef` and flipped upward by `FloatingPanel`.
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef<HTMLButtonElement>(null);
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

  // Desktop HTML5 drag-to-move state. `draggingChecklist` gates the drop
  // targets (so a stray dragover from outside doesn't light them up) and
  // `dropTarget` drives the hover highlight — a folder id, a namespace key,
  // `CHECKLIST_DROP_ROOT` for "out of any folder", or `CHECKLIST_DROP_ARCHIVE`.
  // The touch long-press path reports its hovered target via `activeDropKey`,
  // and both paths commit through the same `onDrop` resolver (`App`).
  const onDrop = useChecklistDrop();
  const activeDropKey = useChecklistDropKey();
  const [draggingChecklist, setDraggingChecklist] = useState<string | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function startChecklistDrag(e: ReactDragEvent, id: string) {
    e.dataTransfer.setData(CHECKLIST_DND_TYPE, id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingChecklist(id);
  }
  function endChecklistDrag() {
    setDraggingChecklist(null);
    setDropTarget(null);
  }
  function allowDropOn(e: ReactDragEvent, key: string) {
    if (!draggingChecklist) return;
    e.preventDefault();
    // Folders nest inside the ungrouped root drop zone, so stop the hover from
    // bubbling up and lighting the root highlight at the same time.
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== key) setDropTarget(key);
  }
  function commitDrop(e: ReactDragEvent, key: string) {
    e.preventDefault();
    // A drop on a folder/namespace must not also bubble to the root zone
    // (which would immediately move the list back out to the top level).
    e.stopPropagation();
    const id = e.dataTransfer.getData(CHECKLIST_DND_TYPE) || draggingChecklist;
    endChecklistDrag();
    if (id) onDrop(id, key);
  }

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

  // One checklist row in the switcher. `indent` nudges it right when it sits
  // inside an expanded folder. Every row is draggable — drop it on a folder,
  // the ungrouped zone, a namespace, or the Archive button to move it (see
  // `checklist-drag.tsx`); that's the only way lists move between folders and
  // namespaces. On top of that, desktop gets a right-click menu (archive /
  // remove) and touch a swipe-to-delete strip. The last remaining list can't
  // be archived or removed (the views always need one to show), so it carries
  // no menu/strip — but it stays draggable.
  function renderChecklistRow(c: ChecklistSummary, indent = false): ReactNode {
    const row = (
      <NavItem
        icon={<ChecklistIcon className="h-5 w-5" />}
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
    const draggable = (inner: ReactNode): ReactNode => (
      <ChecklistDragItem
        key={c.id}
        checklistId={c.id}
        title={c.name}
        enabled={!desktop}
        draggable={desktop}
        dragging={draggingChecklist === c.id}
        onDragStart={desktop ? (e) => startChecklistDrag(e, c.id) : undefined}
        onDragEnd={desktop ? endChecklistDrag : undefined}
      >
        {inner}
      </ChecklistDragItem>
    );
    if (!canRemove) return draggable(row);
    if (desktop) {
      const actions: ContextMenuItem[] = [
        {
          label: t("app.archive"),
          icon: <ArchiveIcon className="h-4 w-4" />,
          onSelect: () => archiveChecklist(c.id),
        },
        {
          label: t("nav.removeChecklist"),
          icon: <TrashIcon className="h-4 w-4" />,
          danger: true,
          onSelect: () => removeChecklist(c.id),
        },
      ];
      return draggable(
        <div onContextMenu={(e) => openMenu(actions, e)}>{row}</div>,
      );
    }
    return draggable(
      <ChecklistRowStrip
        removeLabel={t("nav.removeChecklist")}
        onRemove={() => removeChecklist(c.id)}
      >
        {row}
      </ChecklistRowStrip>,
    );
  }

  // One folder group: its header row (collapse toggle + name + count + a "+"
  // that starts a new list inside it) and, when expanded, the lists filed in
  // it. Collapsed, it still surfaces the active list when that list lives
  // inside it — the same courtesy the namespace section pays the active
  // namespace, so the user never loses sight of where the open list sits.
  // While being renamed the header is swapped for the inline name editor.
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
    // Collapsed, peek just the active list if it's filed in this folder.
    const activePeek = expanded
      ? undefined
      : inside.find((c) => c.id === activeChecklistId);
    return (
      <div key={f.id} {...{ [CHECKLIST_DROP_ATTR]: f.id }}>
        <FolderRow
          name={f.name}
          count={f.count}
          expanded={expanded}
          desktop={desktop}
          isDropTarget={dropTarget === f.id || activeDropKey === f.id}
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
          onDragOver={(e) => allowDropOn(e, f.id)}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => commitDrop(e, f.id)}
          openMenu={openMenu}
        />
        {expanded
          ? inside.map((c) => renderChecklistRow(c, true))
          : activePeek && renderChecklistRow(activePeek, true)}
      </div>
    );
  }

  const ungroupedChecklists = checklists.filter((c) => !c.folderId);

  // A list dragged onto the ungrouped zone (out of any folder) is hovering the
  // root drop target. Folders always render above the loose lists, so the
  // "no folder" landing area is the contiguous region below them — which is
  // exactly what we frame with a border so the user can see where the list
  // will land. When there are no folders that region is the whole list.
  const rootActive =
    dropTarget === CHECKLIST_DROP_ROOT || activeDropKey === CHECKLIST_DROP_ROOT;

  // The drawer's body — identical whether it slides in over a backdrop
  // (narrow viewports) or sits docked as a permanent sidebar (pinned). Only
  // the framing `<nav>` differs between the two, so the rows live here once.
  // Collapsed, the namespace section shows only the active namespace (so the
  // user still sees where they are); expanded, it lists them all.
  const visibleNamespaces = namespacesExpanded
    ? namespaces
    : namespaces.filter((ns) => ns.slug === activeNamespace);

  const sections = (
    <>
      {/* Namespace — a fixed (non-scrolling) header that folds the seldom-
          touched list away. The cog still opens the manage dialog; the
          heading itself toggles the fold. */}
      <div className="shrink-0">
        <SectionHeader
          label={t("namespace.section")}
          collapsible
          expanded={namespacesExpanded}
          onToggle={() => setNamespacesExpanded((v) => !v)}
          onAdd={() => pick(() => dispatch({ kind: "namespaces" }))}
          addLabel={t("namespace.manage")}
          addIcon={<CogIcon className="h-4 w-4" />}
        />
        {visibleNamespaces.map((ns) => {
          // A namespace that has picked an icon or a colour shows its own
          // glyph, tinted to its accent — only the glyph is coloured, never
          // the row's text. One left untouched gets the plain folder fallback;
          // the active namespace reads from the row's accent highlight (and the
          // icon's accent tint) rather than a swapped-in checkmark.
          const customised = Boolean(ns.glyph || ns.color);
          const icon = customised ? (
            <NamespaceGlyph
              name={ns.glyph}
              className="h-5 w-5"
              style={ns.color ? { color: ns.color } : undefined}
            />
          ) : (
            <FolderIcon className="h-5 w-5" />
          );
          // Every namespace but the active one is a drop target: dropping a
          // checklist onto it moves the list into that namespace.
          const droppable = ns.slug !== activeNamespace;
          const nsKey = checklistDropNamespaceKey(ns.slug);
          const row = (
            <NavItem
              icon={icon}
              label={ns.name}
              active={ns.slug === activeNamespace}
              dropId={droppable ? nsKey : undefined}
              isDropTarget={
                droppable && (dropTarget === nsKey || activeDropKey === nsKey)
              }
              onDragOver={droppable ? (e) => allowDropOn(e, nsKey) : undefined}
              onDragLeave={droppable ? () => setDropTarget(null) : undefined}
              onDrop={droppable ? (e) => commitDrop(e, nsKey) : undefined}
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
      </div>
      {/* The Checklists heading carries no inline "+" any more — New list,
          New folder, and Archive all live on the compact action bar below. It
          stays fixed; only the list beneath it scrolls. */}
      <SectionHeader label={t("nav.checklists")} border />
      {/* The only part of the drawer that grows is the checklist list, so it
          alone scrolls (`flex-1` + `min-h-0` so it can shrink below content
          height) while the namespace header above and the action / footer rows
          below stay put. The whole folders + ungrouped region is the root drop
          zone — dropping a list here (outside any folder) returns it to the top
          level. Folders nest inside as their own drop targets (their dragover
          stops propagation so the root highlight doesn't also light up). */}
      <div
        {...{ [CHECKLIST_DROP_ATTR]: CHECKLIST_DROP_ROOT }}
        onDragOver={(e) => allowDropOn(e, CHECKLIST_DROP_ROOT)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => commitDrop(e, CHECKLIST_DROP_ROOT)}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {folders.map(renderFolder)}
        {/* The loose (no-folder) lists, and the empty space below them, are the
            root landing zone. While a list hovers it we frame the whole region
            with an accent border so it's obvious the drop lands here, outside
            every folder — `flex-1` stretches the frame down to fill the rest of
            the scroll area, not just the rows. */}
        <div
          className={`flex-1 ${
            rootActive
              ? "m-1 rounded-md bg-accent/10 ring-1 ring-accent/50 ring-inset"
              : ""
          }`}
        >
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
        </div>
      </div>
      {/* New list / New folder / Archive and Undo / Redo share one bordered
          panel just above the footer divider, fixed so it falls under the
          thumb no matter how long the checklist list is. A top row of
          create/navigate actions and a bottom row of history actions are
          split by a divider, so the five icon buttons read as one coherent
          block rather than two competing widgets. Each cell splits its row's
          width evenly; the parent owns the border, rounding, and the inner
          dividers. Archive lights up accent while its view is showing and
          carries the archived count; undo/redo dim and go inert at the ends
          of the timeline but keep the drawer open so a burst of reverts can
          be applied without reopening it. */}
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          <div className="flex divide-x divide-line">
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
              dropId={CHECKLIST_DROP_ARCHIVE}
              isDropTarget={
                dropTarget === CHECKLIST_DROP_ARCHIVE ||
                activeDropKey === CHECKLIST_DROP_ARCHIVE
              }
              onDragOver={(e) => allowDropOn(e, CHECKLIST_DROP_ARCHIVE)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => commitDrop(e, CHECKLIST_DROP_ARCHIVE)}
              onClick={() => navigate("archive")}
            />
          </div>
          <div className="flex divide-x divide-line">
            <BarButton
              icon={<UndoIcon className="h-5 w-5" />}
              label={t("nav.undo")}
              disabled={!canUndo}
              onClick={undo}
            />
            <BarButton
              icon={<RedoIcon className="h-5 w-5" />}
              label={t("nav.redo")}
              disabled={!canRedo}
              onClick={redo}
            />
          </div>
        </div>
      </div>
      {/* The relocated burger menu, fixed at the foot of the drawer: Donate,
          the trophy, an "About" dropdown that folds away the project links
          (source / privacy / what's new), and Settings pinned last under the
          thumb. */}
      <div className="flex shrink-0 flex-col border-t border-line [padding-top:calc(1.25rem_-_var(--density-row-py))]">
        {donateUrl && (
          <MenuLink
            icon={<HeartIcon className="h-5 w-5 text-danger" />}
            label={t("menu.donate")}
            href={donateUrl}
            external
            onClick={close}
          />
        )}
        {/* The trophy, relocated from the header. It does its own
            quiet-vs-lit dispatch, so it just needs the drawer closed
            behind it. Hides itself when achievements are disabled. */}
        <TrophyButton onSelect={close} />
        {/* About: a single row that reveals the project links in an
            upward-flipping dropdown (there's no room below at the foot of the
            drawer). It reads as a plain footer row — no chevron — and just
            toggles the panel open and shut. */}
        <button
          ref={aboutRef}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={aboutOpen}
          onClick={() => setAboutOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
        >
          <span className="text-muted">
            <HelpCircleIcon className="h-5 w-5" />
          </span>
          <span className="flex-1">{t("menu.about")}</span>
        </button>
        <MenuButton
          icon={<CogIcon className="h-5 w-5" />}
          label={t("menu.settings")}
          onClick={() => pick(() => dispatch({ kind: "settings" }))}
        />
      </div>
      <FloatingPanel
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        triggerRef={aboutRef}
        placement={ABOUT_PLACEMENT}
        className="py-1"
      >
        <MenuButton
          icon={<SparklesIcon className="h-5 w-5" />}
          label={t("menu.changelog")}
          onClick={() => {
            setAboutOpen(false);
            pick(() => dispatch({ kind: "changelog" }));
          }}
        />
        <MenuLink
          icon={<CodeIcon className="h-5 w-5" />}
          label={t("menu.source")}
          href={SOURCE_URL}
          external
          sublabel={BUILD_LABEL}
          onClick={() => {
            setAboutOpen(false);
            close();
          }}
        />
        <MenuLink
          icon={<ShieldIcon className="h-5 w-5" />}
          label={t("menu.privacy")}
          href={privacyUrl}
          onClick={() => {
            setAboutOpen(false);
            close();
          }}
        />
      </FloatingPanel>
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
        className={`relative flex h-full w-64 shrink-0 flex-col overflow-hidden bg-surface [padding-bottom:max(env(safe-area-inset-bottom),calc(1.25rem_-_var(--density-row-py)))] [padding-top:env(safe-area-inset-top)] ${
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
            className={`relative flex w-64 max-w-[80%] flex-col overflow-hidden bg-surface shadow-xl [padding-bottom:max(env(safe-area-inset-bottom),calc(1.25rem_-_var(--density-row-py)))] [padding-top:env(safe-area-inset-top)] ${
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
