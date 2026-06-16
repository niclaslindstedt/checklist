import type { Settings } from "../../settings/types.ts";
import type { UpdateSetting } from "../../settings/useSettings.ts";
import type { UseStorageBackend } from "../../storage/useStorageBackend.ts";
import { SettingsModal } from "../../ui/settings/SettingsModal.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the settings dialog's open state and the tab it lands on. A
// "settings" command from the modal bus opens it; the cloud-sync glyph
// dispatches one targeting the storage tab.

type Props = {
  settings: Settings;
  onUpdate: UpdateSetting;
  storage: UseStorageBackend;
};

export function SettingsModalHost({ settings, onUpdate, storage }: Props) {
  const { command, close } = useModalState("settings");
  return (
    <SettingsModal
      open={command !== null}
      onClose={close}
      settings={settings}
      onUpdate={onUpdate}
      storage={storage}
      initialTab={command?.tab}
    />
  );
}
