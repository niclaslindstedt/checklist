import { createContext, useContext } from "react";

import type {
  ConnectionProbeResult,
  SaveStatus,
  UseChecklist,
} from "../app/use-checklist.ts";
import type { BackendId } from "../storage/backend-preference.ts";

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

/**
 * What the header's cloud-sync glyph (see `SyncStatus`) and the details
 * modal it opens (see `SyncDetailsModal`) need to render. Only present for
 * a cloud-backed session — null for a local-only one.
 */
export type SyncInfo = {
  /** The active cloud backend, used to build the provider path / web URL. */
  backend: BackendId;
  /** The active namespace's slug — its cloud folder is where files live. */
  namespace: string;
  providerName: string;
  status: SaveStatus;
  /** Why the last save failed; shown in the details modal. Null unless error. */
  statusDetail: string | null;
  dirty: boolean;
  /** True when the backend is unreachable and we're on the on-device copy. */
  offline: boolean;
  onSave: () => void;
  /** Re-read the document from the backend — the modal's Reload glyph. */
  onReload: () => void;
  onOpenDetails: () => void;
  /**
   * Re-issue OAuth for the active cloud backend, shown as a "Reconnect"
   * button while the session needs re-authorising. Null for backends with
   * no reconnect gesture (the local folder reconnects from settings).
   */
  onReconnect: (() => Promise<void>) | null;
  /**
   * Actively re-probe backend reachability — the "Check connection" button
   * shown while offline. Resolves with what it found so the modal can show a
   * live status, and recovers (re-read + flush queued edits) on success.
   */
  onCheckConnection: () => Promise<ConnectionProbeResult>;
};

export type ChecklistContextValue = UseChecklist & {
  /**
   * Cloud-sync status for the header glyph, or null for a local-only
   * session (the icon only appears when a cloud backend is active).
   */
  sync: SyncInfo | null;
  /**
   * When true, the user has switched item notes off (Settings → Lists):
   * rows render title-only and the in-place editor hides its note field.
   * A presentational flag, mirrored from the synced `Settings`.
   */
  disableItemNotes: boolean;
  /**
   * Whether the header shows the progress counter (checked / total) beside
   * the copy and sync glyphs. A presentational flag mirrored from the
   * synced `Settings`; on by default.
   */
  showItemCount: boolean;
  /**
   * Whether the copy button includes the archived items in the markdown it
   * puts on the clipboard. A flag mirrored from the synced `Settings`; off
   * by default, so a copied list is just its active items.
   */
  includeArchivedInCopy: boolean;
  /**
   * Whether a newly entered item title has its first letter capitalised, both
   * live in the entry field and when it commits. A flag mirrored from the
   * synced `Settings`; off by default.
   */
  capitalizeItems: boolean;
  /**
   * Whether the checklist view should animate rows sliding into place when
   * the displayed order changes (a checked item sinking to the bottom). True
   * only when both checked-sorting and its animation are enabled in the
   * synced `Settings`; the view feeds it to the FLIP hook.
   */
  animateReorder: boolean;
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
