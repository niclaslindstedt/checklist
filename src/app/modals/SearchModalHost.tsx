import { useModalState } from "../../ui/modal-bus.ts";
import { SearchModal } from "../../ui/SearchModal.tsx";

// Owns the search modal's open state; opens on a "search" command from the
// modal bus (the action bar's magnifier, right of undo/redo). The modal reads
// the document and the selection straight from the checklist context, so this
// host only toggles it.

export function SearchModalHost() {
  const { command, close } = useModalState("search");
  return <SearchModal open={command !== null} onClose={close} />;
}
