import type { Settings } from "../../settings/types.ts";
import type { UseStorageBackend } from "../../storage/useStorageBackend.ts";
import { SettingsModal } from "../../ui/settings/SettingsModal.tsx";
import { useModalState } from "../../ui/modal-bus.ts";

// Owns the settings dialog's open state and the tab it lands on. A
// "settings" command from the modal bus opens it; the cloud-sync glyph
// dispatches one targeting the storage tab.

type Props = {
  settings: Settings;
  // Commit the dialog's edited draft. The producer preserves the fields the
  // dialog doesn't own (achievements, menu-button position).
  onSave: (draft: Settings) => void;
  // Stream the dialog's live appearance draft up to the theme engine so the
  // user sees their pick before saving; `null` reasserts the persisted look.
  onPreviewAppearance: (preview: Settings | null) => void;
  storage: UseStorageBackend;
};

export function SettingsModalHost({
  settings,
  onSave,
  onPreviewAppearance,
  storage,
}: Props) {
  const { command, close } = useModalState("settings");
  return (
    <SettingsModal
      open={command !== null}
      onClose={close}
      settings={settings}
      onSave={onSave}
      onPreviewAppearance={onPreviewAppearance}
      storage={storage}
      initialTab={command?.tab}
    />
  );
}
