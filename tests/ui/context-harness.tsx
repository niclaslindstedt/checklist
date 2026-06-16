// Shared builders for the checklist / nav contexts the views and SideMenu
// now read from instead of props. Tests supply only the fields they assert
// on; the rest fall back to inert defaults.
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { createChecklist } from "../../src/domain/checklists.ts";
import { emptySnapshot } from "../../src/domain/types.ts";
import {
  ChecklistContext,
  type ChecklistContextValue,
} from "../../src/ui/checklist-context.ts";
import type { NavContextValue } from "../../src/ui/nav-context.ts";

const noop = (): void => {};

const fallbackList = createChecklist(
  "list-0",
  "Checklist",
  "2026-01-01T00:00:00.000Z",
);

export function makeChecklistValue(
  over: Partial<ChecklistContextValue> = {},
): ChecklistContextValue {
  return {
    snapshot: emptySnapshot(),
    items: [],
    archivedItems: [],
    checkedCount: 0,
    activeList: fallbackList,
    activeChecklistId: fallbackList.id,
    checklists: [{ id: fallbackList.id, name: fallbackList.name }],
    selectChecklist: noop,
    addChecklist: noop,
    renameChecklist: noop,
    removeChecklist: noop,
    addItem: noop,
    toggle: noop,
    remove: noop,
    archive: noop,
    unarchive: noop,
    reorder: noop,
    addItemPosition: "bottom",
    reload: async () => {},
    conflict: null,
    resolveConflict: noop,
    status: "idle",
    dirty: false,
    saveNow: noop,
    undo: noop,
    redo: noop,
    canUndo: false,
    canRedo: false,
    sync: null,
    logoSrc: "/favicon.svg",
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
    <ChecklistContext.Provider value={makeChecklistValue(value)}>
      {ui}
    </ChecklistContext.Provider>,
  );
}
