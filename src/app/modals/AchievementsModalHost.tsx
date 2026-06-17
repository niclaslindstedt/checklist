import type { Settings } from "../../settings/types.ts";
import { AchievementsModal } from "../../ui/achievements/AchievementsModal.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the achievements tour's open state; opens on an "achievements"
// command from the modal bus (the header trophy button and the side-menu
// entry both dispatch it). On close it clears the unseen queue so the
// trophy badge empties — App passes that down as `onClose`.

type Props = {
  settings: Settings;
  onClose: () => void;
};

export function AchievementsModalHost({ settings, onClose }: Props) {
  const { command, close } = useModalState("achievements");
  const open = command !== null;
  return (
    <AchievementsModal
      open={open}
      onClose={() => {
        close();
        onClose();
      }}
      unlocked={settings.achievements}
    />
  );
}
