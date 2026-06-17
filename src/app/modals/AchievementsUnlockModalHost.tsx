import type { Settings } from "../../settings/types.ts";
import { AchievementUnlockModal } from "../../ui/achievements/AchievementUnlockModal.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the unlock-notification modal's open state; opens on an
// "achievements-unlock" command from the modal bus (the lit trophy button).
// Lists the unseen unlocks and, on close, clears the unseen queue so the
// trophy returns to its quiet state — App passes that down as `onClear`.

type Props = {
  settings: Settings;
  onClear: () => void;
};

export function AchievementsUnlockModalHost({ settings, onClear }: Props) {
  const { command, close } = useModalState("achievements-unlock");
  return (
    <AchievementUnlockModal
      open={command !== null}
      unseenIds={settings.unseenAchievements}
      onClose={() => {
        close();
        onClear();
      }}
    />
  );
}
