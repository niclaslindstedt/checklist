import { useT } from "../i18n";
import type { Snapshot } from "../domain/types.ts";
import { Button } from "./form/index.ts";
import { Modal } from "./Modal.tsx";

// Opens when a save collides with a newer remote revision (another
// device pushed while this one was editing). The two copies are
// summarised side by side so the user can pick which one wins — there is
// no auto-merge. Ported from the budget project's
// `ConflictResolutionModal`, pared to the checklist's data model.
//
// "Keep mine" re-saves the in-memory bytes basing the write on the
// remote revision so the backend accepts the overwrite. "Keep theirs"
// swaps in-memory state for the remote bytes without writing back.

type Props = {
  open: boolean;
  /** This device's in-memory document. */
  local: Snapshot;
  /** The document currently on the backend. */
  remote: Snapshot;
  onResolve: (keep: "local" | "remote") => void;
};

function summarise(doc: Snapshot): { lists: number; items: number } {
  let items = 0;
  for (const list of doc.checklists ?? []) {
    items += list.items?.length ?? 0;
  }
  return { lists: doc.checklists?.length ?? 0, items };
}

export function ConflictResolutionModal({
  open,
  local,
  remote,
  onResolve,
}: Props) {
  const t = useT();
  const localStats = summarise(local);
  const remoteStats = summarise(remote);

  return (
    <Modal
      open={open}
      // Non-dismissable: the user has to pick a side because the two
      // copies can't coexist. Backdrop click and Escape are no-ops.
      onClose={() => {}}
      labelledBy="conflict-title"
    >
      <header className="flex shrink-0 items-center border-b border-line bg-surface-3 px-4 py-3">
        <h2
          id="conflict-title"
          className="text-sm font-bold tracking-wide text-fg-bright"
        >
          {t("sync.conflictTitle")}
        </h2>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        <p className="text-sm text-fg">{t("sync.conflictHint")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-line bg-surface-2 px-3 py-2">
            <div className="text-xs font-bold text-fg-bright">
              {t("sync.conflictLocalLabel")}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t("sync.conflictCounts", {
                lists: localStats.lists,
                items: localStats.items,
              })}
            </div>
          </div>
          <div className="rounded border border-line bg-surface-2 px-3 py-2">
            <div className="text-xs font-bold text-fg-bright">
              {t("sync.conflictRemoteLabel")}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t("sync.conflictCounts", {
                lists: remoteStats.lists,
                items: remoteStats.items,
              })}
            </div>
          </div>
        </div>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
        <Button variant="secondary" onClick={() => onResolve("remote")}>
          {t("sync.keepRemote")}
        </Button>
        <Button variant="primary" onClick={() => onResolve("local")}>
          {t("sync.keepLocal")}
        </Button>
      </footer>
    </Modal>
  );
}
