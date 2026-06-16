import { useEffect, useMemo, useState } from "react";

import { useDevMode } from "../../dev/useDevMode.ts";
import { useT, type MessageKey } from "../../i18n";
import type { Settings } from "../../settings/types.ts";
import type { UpdateSetting } from "../../settings/useSettings.ts";
import type { UseStorageBackend } from "../../storage/useStorageBackend.ts";
import { Button } from "../form/index.ts";
import { CloseIcon } from "../icons.tsx";
import { Modal } from "../Modal.tsx";
import { AppearanceTab } from "./tabs/appearance.tsx";
import { DeveloperTab } from "./tabs/developer.tsx";
import { GeneralTab } from "./tabs/general.tsx";
import { LogsTab } from "./tabs/logs.tsx";
import { StorageTab } from "./tabs/storage.tsx";

// Settings dialog. Lands on the General tab; Theme is always present;
// Developer and Logs appear only when developer mode is on. Modelled on
// the budget project's tabbed SettingsModal — a left rail on desktop,
// a horizontal strip on mobile — pared to the checklist's four tabs.
// Settings apply immediately (the theme engine previews the live values),
// so the footer offers a single Done button rather than Save / Cancel.

type TabId = "general" | "theme" | "storage" | "developer" | "logs";

const TAB_LABEL_KEYS: Record<TabId, MessageKey> = {
  general: "settings.tab.general",
  theme: "settings.tab.theme",
  storage: "settings.tab.storage",
  developer: "settings.tab.developer",
  logs: "settings.tab.logs",
};

type Props = {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onUpdate: UpdateSetting;
  storage: UseStorageBackend;
  /** Tab to jump to when the dialog opens (e.g. the cloud-sync glyph
   *  deep-links to Storage). Omit to keep the last-used tab. */
  initialTab?: TabId;
};

export function SettingsModal({
  open,
  onClose,
  settings,
  onUpdate,
  storage,
  initialTab,
}: Props) {
  const t = useT();
  const { devMode } = useDevMode();
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const tabs: TabId[] = useMemo(
    () =>
      devMode
        ? ["general", "theme", "storage", "developer", "logs"]
        : ["general", "theme", "storage"],
    [devMode],
  );

  // Jump to the requested tab each time the dialog opens with one set.
  useEffect(() => {
    if (open && initialTab) setActiveTab(initialTab);
  }, [open, initialTab]);

  // If developer mode is switched off while the Developer / Logs tab is
  // active, fall back to General so we never show an empty panel.
  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab("general");
  }, [tabs, activeTab]);

  return (
    <Modal open={open} onClose={onClose} labelledBy="settings-title">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <h2
          id="settings-title"
          className="text-sm font-bold tracking-wide text-fg-bright"
        >
          {t("settings.title")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("settings.close")}
          className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
        <div
          role="tablist"
          aria-label={t("settings.sections")}
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface-3 p-2 sm:w-40 sm:flex-col sm:gap-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-b-0"
        >
          {tabs.map((tab) => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`settings-tab-${tab}`}
                aria-controls={`settings-tabpanel-${tab}`}
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 cursor-pointer rounded px-3 py-1.5 text-left text-sm whitespace-nowrap sm:w-full ${
                  active
                    ? "bg-accent/15 font-bold text-accent"
                    : "text-fg hover:bg-surface-2"
                }`}
              >
                {t(TAB_LABEL_KEYS[tab])}
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`settings-tabpanel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
          className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4"
        >
          {activeTab === "general" && (
            <GeneralTab settings={settings} onUpdate={onUpdate} />
          )}
          {activeTab === "theme" && (
            <AppearanceTab settings={settings} onUpdate={onUpdate} />
          )}
          {activeTab === "storage" && <StorageTab storage={storage} />}
          {activeTab === "developer" && <DeveloperTab />}
          {activeTab === "logs" && <LogsTab />}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
        <Button variant="primary" onClick={onClose}>
          {t("settings.done")}
        </Button>
      </footer>
    </Modal>
  );
}
