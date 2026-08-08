import { defer } from "../../ui/deferred.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the search modal's open state; opens on a "search" command from the
// modal bus (the action bar's magnifier, right of undo/redo). The modal reads
// the document and the selection straight from the checklist context, so this
// host only toggles it.
//
// Deferred — but this is the one surface where the timing is load-bearing:
// `SideMenu` dispatches the search command inside `flushSync` so the field
// focuses within the tap and iOS raises the soft keyboard. That survives only
// because `warm: true` gets the chunk resident during idle after first paint,
// and a resident chunk renders on the very next render with no promise turn in
// between. Don't drop the `warm`, and don't swap this for a promise-only
// loader (`lazy` + `Suspense`).
const SearchModal = defer(
  () => import("../../ui/SearchModal.tsx").then((m) => m.SearchModal),
  // The one surface that must be resident before it is asked for.
  { warm: true },
);

export function SearchModalHost() {
  const { command, close } = useModalState("search");
  const open = command !== null;
  return <SearchModal active={open} open={open} onClose={close} />;
}
