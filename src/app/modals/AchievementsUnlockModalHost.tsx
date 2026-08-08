import type { Settings } from "../../settings/types.ts";
import { defer } from "../../ui/deferred.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the unlock-notification modal's open state; opens on an
// "achievements-unlock" command from the modal bus (the lit trophy button).
// Lists the unseen unlocks and, on close, clears the unseen queue so the
// trophy returns to its quiet state — App passes that down as `onClear`.
//
// Deferred: only reached by tapping a lit trophy.
const AchievementUnlockModal = defer(() =>
  import("../../ui/achievements/AchievementUnlockModal.tsx").then(
    (m) => m.AchievementUnlockModal,
  ),
);

type Props = {
  settings: Settings;
  onClear: () => void;
};

export function AchievementsUnlockModalHost({ settings, onClear }: Props) {
  const { command, close } = useModalState("achievements-unlock");
  const open = command !== null;
  return (
    <AchievementUnlockModal
      active={open}
      open={open}
      unseenIds={settings.unseenAchievements}
      onClose={() => {
        close();
        onClear();
      }}
    />
  );
}
