import type { Settings } from "../../settings/types.ts";
import { defer } from "../../ui/deferred.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the achievements tour's open state; opens on an "achievements"
// command from the modal bus (the quiet trophy button). This is the
// browse-the-whole-catalog view — it does not touch the unseen queue
// (that's the unlock modal's job), matching budget's split.
//
// Deferred — though only the modal's own code moves. The glyph set stays in
// the main chunk because `catalog.ts` names a glyph per entry and the unlock
// watcher needs the catalog on every state transition; prising the glyph map
// off the catalog is the change that would move it.
const AchievementsModal = defer(() =>
  import("../../ui/achievements/AchievementsModal.tsx").then(
    (m) => m.AchievementsModal,
  ),
);

type Props = {
  settings: Settings;
};

export function AchievementsModalHost({ settings }: Props) {
  const { command, close } = useModalState("achievements");
  const open = command !== null;
  return (
    <AchievementsModal
      active={open}
      open={open}
      onClose={close}
      unlocked={settings.achievements}
    />
  );
}
