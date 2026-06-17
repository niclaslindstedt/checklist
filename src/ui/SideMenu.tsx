import { useEffect, useId, useState, type ReactNode } from "react";

import { BUILD_LABEL } from "../build-env.ts";
import { useT } from "../i18n";
import {
  DEFAULT_NAMESPACE_SLUG,
  type Namespace,
} from "../storage/namespaces.ts";
import { APP_VIEWPORT_RECT } from "./appViewportRect.ts";
import { useChecklistContext } from "./checklist-context.ts";
import { useNav } from "./nav-context.ts";
import { useDraggableMenuButton } from "./hooks/useDraggableMenuButton.ts";
import { useSwipeReveal } from "./hooks/useSwipeReveal.ts";
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
  TrashIcon,
  UndoIcon,
} from "./icons.tsx";
import { useModalDispatch } from "./modal-bus.ts";
import { TrophyGlyph } from "../achievements/glyphs.tsx";
import { NamespaceGlyph } from "./NamespaceGlyph.tsx";

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

const SOURCE_URL = "https://github.com/niclaslindstedt/checklist";

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
    activeChecklistId,
    selectChecklist,
    addChecklist,
    removeChecklist,
  } = useChecklistContext();
  const archivedCount = archivedGroups.reduce((n, g) => n + g.items.length, 0);
  const drag = useDraggableMenuButton(position, setPosition);

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
      <SectionHeader
        label={t("nav.checklists")}
        border
        onAdd={() => {
          addChecklist();
          navigate("checklist");
        }}
        addLabel={t("nav.newChecklist")}
      />
      {checklists.map((c) => {
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
            onClick={() => {
              selectChecklist(c.id);
              navigate("checklist");
            }}
          />
        );
        // The last remaining list can't be removed — the views always
        // need one to show — so it renders without the swipe action.
        if (checklists.length <= 1) {
          return <div key={c.id}>{row}</div>;
        }
        return (
          <SwipeToRemove
            key={c.id}
            actionLabel={t("nav.removeChecklist")}
            onRemove={() => removeChecklist(c.id)}
          >
            {row}
          </SwipeToRemove>
        );
      })}
      {/* Archive lives at the foot of the checklists list — it's a
                view onto the active list, not a section of its own. */}
      <NavItem
        icon={<ArchiveIcon className="h-5 w-5" />}
        label={t("nav.archive")}
        active={current === "archive"}
        badge={archivedCount > 0 ? archivedCount : undefined}
        onClick={() => navigate("archive")}
      />
      <SectionHeader label={t("nav.edit")} border />
      {/* Undo / redo keep the drawer open so a burst of reverts can
                be applied without reopening it each time. */}
      <NavItem
        icon={<UndoIcon className="h-5 w-5" />}
        label={t("nav.undo")}
        active={false}
        disabled={!canUndo}
        onClick={undo}
      />
      <NavItem
        icon={<RedoIcon className="h-5 w-5" />}
        label={t("nav.redo")}
        active={false}
        disabled={!canRedo}
        onClick={redo}
      />
      {/* The old top-right burger menu, pinned to the foot of the
                drawer with its order inverted so it reads bottom-up. */}
      <div className="mt-auto flex flex-col border-t border-line [padding-top:calc(1.25rem_-_var(--density-row-py))]">
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
        <MenuButton
          icon={<TrophyGlyph className="h-5 w-5" />}
          label={t("menu.achievements")}
          onClick={() => pick(() => dispatch({ kind: "achievements" }))}
        />
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
      className={`flex w-full items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm ${
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
