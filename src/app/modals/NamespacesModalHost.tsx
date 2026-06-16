import type { UseStorageBackend } from "../../storage/useStorageBackend.ts";
import { NamespacesModal } from "../../ui/NamespacesModal.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the namespace-management dialog's open state; opens on a
// "namespaces" command from the modal bus. The namespace data and
// operations come from `useStorageBackend` via App. Create / remove are
// passed in already wrapped with their toast confirmations (App owns the
// toast stack), so every entry point announces the same way.

type Props = {
  storage: UseStorageBackend;
  /** Create a namespace and toast it (App's toast-wrapped `createNamespace`). */
  onCreate: (name: string) => void;
  /** Remove a namespace and toast it (App's toast-wrapped `removeNamespace`). */
  onRemove: (slug: string) => Promise<void>;
};

export function NamespacesModalHost({ storage, onCreate, onRemove }: Props) {
  const { command, close } = useModalState("namespaces");
  return (
    <NamespacesModal
      open={command !== null}
      onClose={close}
      namespaces={storage.namespaces}
      activeNamespace={storage.activeNamespace}
      onSwitch={storage.switchNamespace}
      onCreate={onCreate}
      onRename={storage.renameNamespace}
      onSetAppearance={storage.setNamespaceAppearance}
      onRemove={onRemove}
    />
  );
}
