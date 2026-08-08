import { defer } from "../../ui/deferred.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the "what's new" dialog's open state; opens on a "changelog"
// command from the modal bus.
//
// Deferred, and the biggest single win of the split: the modal pulls in the
// whole of `CHANGELOG.md` plus every inlined `docs/features/*.md`, none of
// which the app touches until someone opens the dialog.
const ChangelogModal = defer(() =>
  import("../../ui/changelog/ChangelogModal.tsx").then((m) => m.ChangelogModal),
);

export function ChangelogModalHost() {
  const { command, close } = useModalState("changelog");
  const open = command !== null;
  return <ChangelogModal active={open} open={open} onClose={close} />;
}
