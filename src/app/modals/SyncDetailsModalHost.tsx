import { useChecklistContext } from "../../ui/checklist-context.ts";
import { defer } from "../../ui/deferred.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the cloud-sync details dialog's open state; opens on a
// "sync-details" command from the modal bus (the header cloud glyph). The
// sync info comes from the checklist context, so this never threads the
// save status through the app root. Renders nothing for a local-only
// session — there's no cloud glyph to open it then.
//
// Deferred: a local-only session never loads the chunk at all.
const SyncDetailsModal = defer(() =>
  import("../../ui/SyncDetailsModal.tsx").then((m) => m.SyncDetailsModal),
);

export function SyncDetailsModalHost() {
  const { command, close } = useModalState("sync-details");
  const { sync } = useChecklistContext();
  const open = command !== null;
  if (!sync) return null;
  return (
    <SyncDetailsModal
      active={open}
      open={open}
      backend={sync.backend}
      namespace={sync.namespace}
      providerName={sync.providerName}
      status={sync.status}
      statusDetail={sync.statusDetail}
      dirty={sync.dirty}
      offline={sync.offline}
      onSaveNow={sync.onSave}
      onReload={sync.onReload}
      onReconnect={sync.onReconnect}
      onCheckConnection={sync.onCheckConnection}
      onClose={close}
    />
  );
}
