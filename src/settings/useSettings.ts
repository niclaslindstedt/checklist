// React state for the appearance `Settings`, backed by localStorage.
// Apply-immediately model: every `update` writes through to storage and
// re-renders, so the theme engine (which reads the live settings)
// previews the change at once — there's no separate draft / save / cancel
// channel to keep in sync.

import { useCallback, useState } from "react";

import { loadSettings, saveSettings } from "./store.ts";
import type { Settings } from "./types.ts";

export type UpdateSetting = <K extends keyof Settings>(
  key: K,
  value: Settings[K],
) => void;

export interface UseSettings {
  settings: Settings;
  update: UpdateSetting;
}

export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const update = useCallback<UpdateSetting>((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}
