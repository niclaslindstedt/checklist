import { memo, useState } from "react";
import type { ReactNode } from "react";

import { useT } from "../i18n";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { useChecklistContext } from "./checklist-context.ts";
import { useContextMenu } from "./hooks/useContextMenu.ts";
import { useDesktopPointer } from "./hooks/useMediaQuery.ts";
import {
  ChecklistIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  RestoreIcon,
  TrashIcon,
} from "./icons.tsx";

// The archive view, reached from the left navigation drawer. Same pinned
// shell as ChecklistView (a header with a count over an internally
// scrolling list) but read-mostly. It holds two kinds of archived thing:
//
//   • Whole archived **lists** (archive a checklist from the sidebar), each
//     restorable or deletable as a unit, listed first.
//   • Archived **items** from the active lists, grouped under a header
//     naming the list they came from. Items restore back into whichever list
//     owns them, not the active one. Each group header is a disclosure button
//     that collapses its items (local view state, default-expanded).
//
// No composer — things only enter the archive by being archived elsewhere.
// On a desktop pointer each row drops its inline buttons for a right-click
// menu (see `useDesktopPointer` / `ContextMenu`); touch keeps the buttons.
// State-free: reads the grouped archived items, the archived lists, and
// their actions from `useChecklistContext`.

function ArchiveViewImpl() {
  const {
    archivedGroups: groups,
    unarchive,
    remove,
    archivedChecklists,
    unarchiveChecklist,
    removeChecklist,
    emptyArchive,
  } = useChecklistContext();
  const t = useT();
  const desktop = useDesktopPointer();
  const {
    state: menuState,
    open: openMenu,
    close: closeMenu,
  } = useContextMenu();
  // Guards the destructive "empty the archive" sweep behind a confirm beat —
  // it wipes every archived list and item at once, so unlike a single-row
  // delete it asks first.
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);
  // Which archived-item groups the user has collapsed. Default-expanded, so
  // only the ids that have been toggled shut live here. Local view state —
  // it doesn't travel with the document.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const itemCount = groups.reduce((n, g) => n + g.items.length, 0);
  const count = itemCount + archivedChecklists.length;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <h1 className="text-lg font-semibold tracking-wide text-fg-bright">
          {t("nav.archive")}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted tabular-nums">{count}</span>
          {count > 0 && (
            <button
              type="button"
              onClick={() => setConfirmingEmpty(true)}
              aria-label={t("nav.emptyArchive")}
              title={t("nav.emptyArchive")}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]">
        {count === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">
            {t("nav.archiveEmpty")}
          </p>
        ) : (
          <>
            {archivedChecklists.length > 0 && (
              <section className="mb-2">
                <h2 className="px-3 pt-1 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                  {t("nav.archivedLists")}
                </h2>
                <ul className="m-0 list-none p-0">
                  {archivedChecklists.map((list) => (
                    <ArchiveRow
                      key={list.id}
                      title={list.name}
                      icon={<ChecklistIcon className="h-4 w-4" />}
                      restoreLabel={t("nav.restoreList")}
                      onRestore={() => unarchiveChecklist(list.id)}
                      onDelete={() => removeChecklist(list.id)}
                      desktop={desktop}
                      onOpenMenu={(e) =>
                        openMenu(
                          [
                            {
                              label: t("nav.restoreList"),
                              icon: <RestoreIcon className="h-4 w-4" />,
                              onSelect: () => unarchiveChecklist(list.id),
                            },
                            {
                              label: t("app.delete"),
                              icon: <TrashIcon className="h-4 w-4" />,
                              danger: true,
                              onSelect: () => removeChecklist(list.id),
                            },
                          ],
                          e,
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            )}

            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.id);
              return (
                <section key={group.id} className="mb-2">
                  <h2 className="first:pt-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={!isCollapsed}
                      className="flex w-full cursor-pointer items-center gap-1.5 px-3 pt-4 pb-1 text-left text-xs font-semibold tracking-wider text-muted uppercase first:pt-1 hover:text-fg"
                    >
                      {isCollapsed ? (
                        <ChevronRightIcon className="-ml-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDownIcon className="-ml-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {group.name}
                      </span>
                      <span className="shrink-0 tabular-nums normal-case">
                        {group.items.length}
                      </span>
                    </button>
                  </h2>
                  {!isCollapsed && (
                    <ul className="m-0 list-none p-0">
                      {group.items.map((item) => (
                        <ArchiveRow
                          key={item.id}
                          title={item.title}
                          checked={item.checked}
                          restoreLabel={t("nav.restore")}
                          onRestore={() => unarchive(item.id)}
                          onDelete={() => remove(item.id)}
                          desktop={desktop}
                          onOpenMenu={(e) =>
                            openMenu(
                              [
                                {
                                  label: t("nav.restore"),
                                  icon: <RestoreIcon className="h-4 w-4" />,
                                  onSelect: () => unarchive(item.id),
                                },
                                {
                                  label: t("app.delete"),
                                  icon: <TrashIcon className="h-4 w-4" />,
                                  danger: true,
                                  onSelect: () => remove(item.id),
                                },
                              ],
                              e,
                            )
                          }
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={closeMenu}
        />
      )}

      <ConfirmDialog
        open={confirmingEmpty}
        title={t("nav.emptyArchive")}
        description={t("nav.emptyArchiveConfirm")}
        confirmLabel={t("nav.emptyArchive")}
        tone="danger"
        onConfirm={() => {
          emptyArchive();
          setConfirmingEmpty(false);
        }}
        onCancel={() => setConfirmingEmpty(false)}
      />
    </div>
  );
}

function ArchiveRow({
  title,
  checked = false,
  icon,
  restoreLabel,
  onRestore,
  onDelete,
  desktop,
  onOpenMenu,
}: {
  title: string;
  checked?: boolean;
  icon?: ReactNode;
  restoreLabel: string;
  onRestore: () => void;
  onDelete: () => void;
  desktop: boolean;
  onOpenMenu: (e: React.MouseEvent) => void;
}) {
  const t = useT();
  return (
    <li
      onContextMenu={desktop ? onOpenMenu : undefined}
      className="flex min-h-11 items-center gap-3 border-b border-line px-3 py-2"
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span
        className={`min-w-0 flex-1 truncate ${
          checked ? "text-muted line-through" : "text-fg"
        }`}
      >
        {title}
      </span>
      {/* Touch keeps the inline buttons; desktop uses the right-click menu. */}
      {!desktop && (
        <>
          <button
            type="button"
            onClick={onRestore}
            aria-label={restoreLabel}
            title={restoreLabel}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
          >
            <RestoreIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("app.delete")}
            title={t("app.delete")}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}

export const ArchiveView = memo(ArchiveViewImpl);
