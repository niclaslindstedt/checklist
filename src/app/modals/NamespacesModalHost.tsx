import type { UseStorageBackend } from "../../storage/useStorageBackend.ts";
import { NamespacesModal } from "../../ui/NamespacesModal.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the namespace-management dialog's open state; opens on a
// "namespaces" command from the modal bus. The namespace data and
// operations come from `useStorageBackend` via App.

type Props = {
  storage: UseStorageBackend;
};

export function NamespacesModalHost({ storage }: Props) {
  const { command, close } = useModalState("namespaces");
  return (
    <NamespacesModal
      open={command !== null}
      onClose={close}
      namespaces={storage.namespaces}
      activeNamespace={storage.activeNamespace}
      onSwitch={storage.switchNamespace}
      onCreate={storage.createNamespace}
      onRename={storage.renameNamespace}
      onRemove={storage.removeNamespace}
    />
  );
}
