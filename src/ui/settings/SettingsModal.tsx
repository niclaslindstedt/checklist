import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";

import { useDevMode } from "../../dev/useDevMode.ts";
import { useT, type MessageKey, type TFunction } from "../../i18n";
import { defaultSettings } from "../../settings/store.ts";
import type { Settings } from "../../settings/types.ts";
import type { UpdateSetting } from "../../settings/useSettings.ts";
import type { UseStorageBackend } from "../../storage/useStorageBackend.ts";
import { FloatingPanel } from "../FloatingPanel.tsx";
import { Button } from "../form/index.ts";
import type { FloatingPlacement } from "../hooks/useFloatingPosition.ts";
import {
  ChecklistIcon,
  CloseIcon,
  CodeIcon,
  CogIcon,
  DatabaseIcon,
  MenuIcon,
  PaletteIcon,
  ScrollTextIcon,
  SlidersIcon,
} from "../icons.tsx";
import { Modal } from "../Modal.tsx";
import { AppearanceTab } from "./tabs/appearance.tsx";
import { DeveloperTab } from "./tabs/developer.tsx";
import { GeneralTab } from "./tabs/general.tsx";
import { ListsTab } from "./tabs/lists.tsx";
import { LogsTab } from "./tabs/logs.tsx";
import { StorageTab } from "./tabs/storage.tsx";

// Settings dialog. Lands on the General tab; Lists, Theme, and Storage are
// always present; Developer appears when developer mode is on, and Logs only
// once log capture is also enabled (there's nothing to show until then).
// Modelled on the budget project's tabbed SettingsModal — a left rail of
// labelled, icon-marked tabs on desktop, collapsed into a burger menu in the
// header on mobile.
//
// The settings the dialog owns (theme, font, list behaviour, the General
// toggles) are edited against a local `draft` and only committed on Save:
// `onPreviewAppearance` streams the draft up to the app so the theme engine
// previews appearance edits live, Cancel drops the draft, and Save flushes it
// through `onSave`. The device-local controls (developer mode, log capture,
// fake data) and the storage connections apply immediately — they don't live
// in the persisted `Settings` document the draft snapshots.

type TabId = "general" | "lists" | "theme" | "storage" | "developer" | "logs";

type IconComponent = ComponentType<{ className?: string }>;

const TAB_LABEL_KEYS: Record<TabId, MessageKey> = {
  general: "settings.tab.general",
  lists: "settings.tab.lists",
  theme: "settings.tab.theme",
  storage: "settings.tab.storage",
  developer: "settings.tab.developer",
  logs: "settings.tab.logs",
};

// Per-tab marker. Rendered both in the desktop rail and inside the mobile
// burger menu, so the same glyph hints at a section regardless of layout.
const TAB_ICONS: Record<TabId, IconComponent> = {
  general: SlidersIcon,
  lists: ChecklistIcon,
  theme: PaletteIcon,
  storage: DatabaseIcon,
  developer: CodeIcon,
  logs: ScrollTextIcon,
};

type TabDef = { id: TabId; label: string; Icon: IconComponent };

function useTabDefs(t: TFunction, tabs: readonly TabId[]): TabDef[] {
  return tabs.map((id) => ({
    id,
    label: t(TAB_LABEL_KEYS[id]),
    Icon: TAB_ICONS[id],
  }));
}

type Props = {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  /** Commit the edited draft. Wired to a producer that preserves the
   *  fields the dialog doesn't own (achievements, menu-button position). */
  onSave: (draft: Settings) => void;
  /** Stream the live appearance draft up so the theme engine previews it.
   *  `null` clears the preview and reasserts the persisted settings. */
  onPreviewAppearance: (preview: Settings | null) => void;
  storage: UseStorageBackend;
  /** Tab to jump to when the dialog opens (e.g. the cloud-sync glyph
   *  deep-links to Storage). Omit to keep the last-used tab. */
  initialTab?: TabId;
};

export function SettingsModal({
  open,
  onClose,
  settings,
  onSave,
  onPreviewAppearance,
  storage,
  initialTab,
}: Props) {
  const t = useT();
  const { devMode, captureLogs } = useDevMode();
  const [activeTab, setActiveTab] = useState<TabId>("general");
  // Local draft of the owned settings. Snapshots `settings` and re-syncs
  // each time the dialog is closed, so the next open starts clean and a
  // cancelled edit never lingers.
  const [draft, setDraft] = useState<Settings>(settings);

  // The Logs tab only appears while developer mode is on *and* log capture
  // is enabled — there's nothing worth showing until logs are being kept.
  const tabs: TabId[] = useMemo(() => {
    if (!devMode) return ["general", "lists", "theme", "storage"];
    const devTabs: TabId[] = [
      "general",
      "lists",
      "theme",
      "storage",
      "developer",
    ];
    if (captureLogs) devTabs.push("logs");
    return devTabs;
  }, [devMode, captureLogs]);

  // Jump to the requested tab each time the dialog opens with one set.
  useEffect(() => {
    if (open && initialTab) setActiveTab(initialTab);
  }, [open, initialTab]);

  // If the active tab disappears — developer mode switched off, or log
  // capture turned off while the Logs tab was open — fall back to General
  // so we never show an empty panel.
  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab("general");
  }, [tabs, activeTab]);

  // Re-sync the draft from the store while the dialog is closed.
  useEffect(() => {
    if (open) return;
    setDraft(settings);
  }, [open, settings]);

  // Stream the live draft up while open so the theme engine previews
  // appearance edits; clear it on close (that's also how Cancel reverts —
  // the persisted settings reassert and the look snaps back).
  useEffect(() => {
    onPreviewAppearance(open ? draft : null);
  }, [open, draft, onPreviewAppearance]);
  // Belt-and-braces clear on unmount.
  useEffect(() => {
    return () => {
      onPreviewAppearance(null);
    };
  }, [onPreviewAppearance]);

  const update = useCallback<UpdateSetting>((key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(draft);
    onClose();
  }, [onSave, draft, onClose]);

  const handleReset = useCallback(() => {
    // Reset only the owned fields; keep the achievements map and the
    // menu-button position the user can't edit from here.
    setDraft((prev) => ({
      ...defaultSettings(),
      menuButtonPosition: prev.menuButtonPosition,
      achievements: prev.achievements,
      unseenAchievements: prev.unseenAchievements,
    }));
  }, []);

  const footer = useMemo(
    () => (
      <SettingsFooter
        t={t}
        onReset={handleReset}
        onCancel={onClose}
        onSave={handleSave}
      />
    ),
    [t, handleReset, onClose, handleSave],
  );

  return (
    <Modal open={open} onClose={onClose} labelledBy="settings-title">
      <SettingsHeader
        t={t}
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onClose={onClose}
      />

      <div className="flex flex-1 overflow-hidden">
        <TabSidebar
          t={t}
          tabs={tabs}
          activeTab={activeTab}
          onSelect={setActiveTab}
        />

        <div
          role="tabpanel"
          id={`settings-tabpanel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
          className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4"
        >
          {activeTab === "general" && (
            <GeneralTab settings={draft} onUpdate={update} />
          )}
          {activeTab === "lists" && (
            <ListsTab settings={draft} onUpdate={update} />
          )}
          {activeTab === "theme" && (
            <AppearanceTab settings={draft} onUpdate={update} />
          )}
          {activeTab === "storage" && <StorageTab storage={storage} />}
          {activeTab === "developer" && <DeveloperTab />}
          {activeTab === "logs" && <LogsTab />}
        </div>
      </div>

      {footer}
    </Modal>
  );
}

// Left-anchored tab menu that opens just below the burger. Routed through
// `FloatingPanel` (rather than an inline absolute div) because the header
// lives inside the Modal's z-50 stacking context, which would otherwise cap
// the menu against the dismiss backdrop; the panel portals it to body level.
const TAB_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 192 },
  anchor: "left",
  coordinateSpace: "viewport",
};

// Header. On mobile the burger + active-tab label form one toggle that opens
// the section menu; on desktop the sidebar owns selection and the header
// shows the static "Settings" title (the burger is hidden at `sm:` and up).
// The h2 stays mounted (sr-only on mobile) so `aria-labelledby` resolves.
function SettingsHeader({
  t,
  tabs,
  activeTab,
  onSelectTab,
  onClose,
}: {
  t: TFunction;
  tabs: readonly TabId[];
  activeTab: TabId;
  onSelectTab: (id: TabId) => void;
  onClose: () => void;
}) {
  const tabDefs = useTabDefs(t, tabs);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const activeDef = tabDefs.find((tab) => tab.id === activeTab);
  const ActiveIcon = activeDef?.Icon ?? CogIcon;
  const activeLabel = activeDef?.label ?? t("settings.title");

  return (
    <header className="relative flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <div ref={triggerRef} className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("settings.chooseSection")}
            className={`-ml-1 inline-flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm font-bold tracking-wide text-fg-bright ${
              menuOpen
                ? "border-accent bg-accent/15"
                : "border-transparent hover:border-line hover:bg-surface-2"
            }`}
          >
            <MenuIcon className="h-[18px] w-[18px] text-muted" />
            <span className="inline-flex shrink-0 text-accent">
              <ActiveIcon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">{activeLabel}</span>
          </button>
          <FloatingPanel
            open={menuOpen}
            onClose={closeMenu}
            triggerRef={triggerRef}
            placement={TAB_MENU_PLACEMENT}
          >
            <div role="menu" className="flex w-full flex-col gap-0.5 p-2">
              {tabDefs.map((tab) => {
                const Icon = tab.Icon;
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="menuitem"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      onSelectTab(tab.id);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface ${
                      isActive ? "font-bold text-accent" : "text-fg"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </FloatingPanel>
        </div>
        <h2
          id="settings-title"
          className="text-sm font-bold tracking-wide text-fg-bright sr-only sm:not-sr-only"
        >
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex shrink-0 text-accent">
              <CogIcon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">{t("settings.title")}</span>
          </span>
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("settings.close")}
        className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </header>
  );
}

// Desktop-only vertical tab rail (hidden below `sm`, where the burger takes
// over). A WAI-ARIA tablist with roving tabindex and arrow-key navigation;
// activation follows focus to match the mouse / touch behaviour.
function TabSidebar({
  t,
  tabs,
  activeTab,
  onSelect,
}: {
  t: TFunction;
  tabs: readonly TabId[];
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  const tabDefs = useTabDefs(t, tabs);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "Home" &&
      e.key !== "End"
    )
      return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowUp") next = idx - 1;
    else if (e.key === "ArrowDown") next = idx + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabDefs.length - 1;
    const wrapped = (next + tabDefs.length) % tabDefs.length;
    const nextDef = tabDefs[wrapped];
    if (!nextDef) return;
    onSelect(nextDef.id);
    buttonRefs.current[nextDef.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label={t("settings.sections")}
      className="hidden w-40 shrink-0 flex-col gap-0.5 overflow-y-auto overscroll-contain border-r border-line bg-surface-3 p-2 sm:flex"
    >
      {tabDefs.map((tab, idx) => {
        const Icon = tab.Icon;
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-controls={`settings-tabpanel-${tab.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
              active
                ? "bg-accent/15 font-bold text-accent"
                : "text-fg hover:bg-surface-2"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Footer pinned below the tab content on every tab. Reset sits on the left;
// Cancel + Save group on the right, mirroring the budget dialog.
const SettingsFooter = memo(function SettingsFooter({
  t,
  onReset,
  onCancel,
  onSave,
}: {
  t: TFunction;
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
      <Button variant="secondary" onClick={onReset}>
        {t("common.resetToDefaults")}
      </Button>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={onSave}>
          {t("common.save")}
        </Button>
      </div>
    </footer>
  );
});
