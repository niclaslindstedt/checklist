// Shared builders for the checklist / nav contexts the views and SideMenu
// now read from instead of props. Tests supply only the fields they assert
// on; the rest fall back to inert defaults.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { createChecklist, flattenItems } from "../../src/domain/checklists.ts";
import { emptySnapshot } from "../../src/domain/types.ts";
import {
  ChecklistContext,
  type ChecklistContextValue,
} from "../../src/ui/checklist-context.ts";
import { ModalBusProvider } from "../../src/ui/ModalBusProvider.tsx";
import type { NavContextValue } from "../../src/ui/nav-context.ts";
import { ToastProvider } from "../../src/ui/toast/Toast.tsx";

const noop = (): void => {};

const fallbackList = createChecklist(
  "list-0",
  "Checklist",
  "2026-01-01T00:00:00.000Z",
);

export function makeChecklistValue(
  over: Partial<ChecklistContextValue> = {},
): ChecklistContextValue {
  // Derive the visible (tree-wide) count from the seeded items unless a test
  // overrides it explicitly, so the header's total tracks the items shown.
  const items = over.items ?? [];
  const visibleCount = over.visibleCount ?? flattenItems(items).length;
  return {
    snapshot: emptySnapshot(),
    items: [],
    visibleCount,
    archivedGroups: [],
    checkedCount: 0,
    activeList: fallbackList,
    activeChecklistId: fallbackList.id,
    checklists: [
      { id: fallbackList.id, name: fallbackList.name, remaining: 0 },
    ],
    selectChecklist: noop,
    addChecklist: noop,
    renameChecklist: noop,
    removeChecklist: noop,
    addItem: () => null,
    importItems: () => 0,
    editItem: noop,
    toggle: noop,
    remove: noop,
    removeEmpty: noop,
    archive: noop,
    archiveFinished: noop,
    deleteFinished: noop,
    unarchive: noop,
    reorder: noop,
    addItemPosition: "bottom",
    reload: async () => {},
    conflict: null,
    resolveConflict: noop,
    status: "idle",
    statusDetail: null,
    dirty: false,
    offline: false,
    loaded: true,
    saveNow: noop,
    undo: noop,
    redo: noop,
    canUndo: false,
    canRedo: false,
    sync: null,
    logoSrc: "/favicon.svg",
    disableItemNotes: false,
    showItemCount: true,
    ...over,
  };
}

export function makeNavValue(
  over: Partial<NavContextValue> = {},
): NavContextValue {
  return {
    open: false,
    current: "checklist",
    toggle: noop,
    close: noop,
    navigate: noop,
    setDragging: noop,
    position: { side: "left", y: 0.5 },
    setPosition: noop,
    showButton: true,
    pinned: false,
    ...over,
  };
}

/** Render `ui` inside a checklist context seeded from `value`. */
export function renderWithChecklist(
  ui: ReactElement,
  value: Partial<ChecklistContextValue> = {},
) {
  return render(
    <ToastProvider>
      <ModalBusProvider>
        <ChecklistContext.Provider value={makeChecklistValue(value)}>
          {ui}
        </ChecklistContext.Provider>
      </ModalBusProvider>
    </ToastProvider>,
  );
}
