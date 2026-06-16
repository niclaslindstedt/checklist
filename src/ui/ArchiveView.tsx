import { memo } from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { useChecklistContext } from "./checklist-context.ts";
import { CloseIcon, RestoreIcon } from "./icons.tsx";

// The archive view, reached from the left navigation drawer. Same pinned
// shell as ChecklistView (a header with a count over an internally
// scrolling list) but read-mostly: each archived row carries a Restore
// button that returns it to its source list and a Delete button that
// removes it for good. No composer — items only enter the archive by
// being archived from a checklist. The archive spans every checklist, so
// items are grouped under a header naming the list they came from. Items
// restore back into whichever list owns them, not the active one.
// State-free: reads the grouped archived items and their actions from
// `useChecklistContext`.

function ArchiveViewImpl() {
  const { archivedGroups: groups, unarchive, remove } = useChecklistContext();
  const t = useT();

  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-center justify-between border-b border-line px-1 pb-3">
        <h1 className="text-lg font-semibold tracking-wide text-fg-bright">
          {t("nav.archive")}
        </h1>
        <span className="text-sm text-muted tabular-nums">{count}</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]">
        {count === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">
            {t("nav.archiveEmpty")}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="mb-2">
              <h2 className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted first:pt-1">
                {group.name}
              </h2>
              <ul className="m-0 list-none p-0">
                {group.items.map((item) => (
                  <ArchiveRow
                    key={item.id}
                    item={item}
                    onRestore={() => unarchive(item.id)}
                    onDelete={() => remove(item.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function ArchiveRow({
  item,
  onRestore,
  onDelete,
}: {
  item: ChecklistItem;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-line px-3 py-2">
      <span
        className={`min-w-0 flex-1 truncate ${
          item.checked ? "text-muted line-through" : "text-fg"
        }`}
      >
        {item.title}
      </span>
      <button
        type="button"
        onClick={onRestore}
        aria-label={t("nav.restore")}
        title={t("nav.restore")}
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
    </li>
  );
}

export const ArchiveView = memo(ArchiveViewImpl);
