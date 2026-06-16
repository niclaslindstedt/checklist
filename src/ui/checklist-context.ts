import { createContext, useContext } from "react";

import type { SaveStatus, UseChecklist } from "../app/use-checklist.ts";

// The checklist surface — the whole `useChecklist` return plus the
// derived cloud-sync info — shared through context so the views read what
// they need instead of App threading ~20 props through `ChecklistView` /
// `ArchiveView` / `SideMenu`. Adding a checklist capability is then an
// edit to `useChecklist` (where it belongs) plus the one leaf that reads
// it — never the call site or a `Props` type in between.
//
// Mirrors the modal-bus (`modal-bus.ts`): the context and its consumer
// hook live in `ui/` so a `ui` component consuming it stays a `ui → ui`
// edge. App owns the state hook and supplies the value; the `UseChecklist`
// shape is imported type-only, so the runtime module graph stays
// `app → ui`.

/** Props the header's cloud-sync glyph needs (see `SyncStatus`). */
export type SyncInfo = {
  providerName: string;
  status: SaveStatus;
  dirty: boolean;
  onSave: () => void;
  onOpenDetails: () => void;
};

export type ChecklistContextValue = UseChecklist & {
  /**
   * Cloud-sync status for the header glyph, or null for a local-only
   * session (the icon only appears when a cloud backend is active).
   */
  sync: SyncInfo | null;
};

export const ChecklistContext = createContext<ChecklistContextValue | null>(
  null,
);

/** The shared checklist surface; throws if no provider is mounted above. */
export function useChecklistContext(): ChecklistContextValue {
  const ctx = useContext(ChecklistContext);
  if (!ctx) {
    throw new Error(
      "checklist context used outside <ChecklistContext.Provider>",
    );
  }
  return ctx;
}
