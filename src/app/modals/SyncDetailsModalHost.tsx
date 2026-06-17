import { useChecklistContext } from "../../ui/checklist-context.ts";
import { useModalState } from "../../ui/modal-bus.ts";
import { SyncDetailsModal } from "../../ui/SyncDetailsModal.tsx";

// Owns the cloud-sync details dialog's open state; opens on a
// "sync-details" command from the modal bus (the header cloud glyph). The
// sync info comes from the checklist context, so this never threads the
// save status through the app root. Renders nothing for a local-only
// session — there's no cloud glyph to open it then.

export function SyncDetailsModalHost() {
  const { command, close } = useModalState("sync-details");
  const { sync } = useChecklistContext();
  if (!sync) return null;
  return (
    <SyncDetailsModal
      open={command !== null}
      backend={sync.backend}
      namespace={sync.namespace}
      providerName={sync.providerName}
      status={sync.status}
      statusDetail={sync.statusDetail}
      dirty={sync.dirty}
      onSaveNow={sync.onSave}
      onReconnect={sync.onReconnect}
      onClose={close}
    />
  );
}
