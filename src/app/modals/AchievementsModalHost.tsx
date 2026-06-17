import type { Settings } from "../../settings/types.ts";
import { AchievementsModal } from "../../ui/achievements/AchievementsModal.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the achievements tour's open state; opens on an "achievements"
// command from the modal bus (the quiet trophy button). This is the
// browse-the-whole-catalog view — it does not touch the unseen queue
// (that's the unlock modal's job), matching budget's split.

type Props = {
  settings: Settings;
};

export function AchievementsModalHost({ settings }: Props) {
  const { command, close } = useModalState("achievements");
  return (
    <AchievementsModal
      open={command !== null}
      onClose={close}
      unlocked={settings.achievements}
    />
  );
}
