import { defer } from "../../ui/deferred.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the "what's new" dialog's open state; opens on a "changelog"
// command from the modal bus.
//
// Deferred, and the biggest single win of the split: the modal pulls in the
// whole of `CHANGELOG.md` plus every inlined `docs/features/*.md`, none of
// which the app touches until someone opens the dialog.
//
// The phone app carries none of it (`CHANGELOG_BUILT` in `src/build-env.ts`).
// The test is the raw define rather than that constant: the bundler sees a
// literal before it builds the module graph, so the deferred import is gone
// from the phone build and the modal's chunk is never emitted.
const ChangelogModal = __NATIVE__
  ? null
  : defer(() =>
      import("../../ui/changelog/ChangelogModal.tsx").then(
        (m) => m.ChangelogModal,
      ),
    );

export function ChangelogModalHost() {
  const { command, close } = useModalState("changelog");
  if (!ChangelogModal) return null;
  const open = command !== null;
  return <ChangelogModal active={open} open={open} onClose={close} />;
}
